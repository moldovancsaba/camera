/**
 * Slideshow Playlist API
 * 
 * GET: Generate next 5 slides for a slideshow with smart playlist logic
 * Returns slides with mosaic layouts for 1:1 and 9:16 images
 * 
 * Filters inactive users from playlist generation.
 */

import { resolveScreenDesign } from '@/lib/slideshow/screen-design';
import { loadEventTheme } from '@/lib/theme/load';
import { brokenAddresses } from '@/lib/media/pictures';
import { cachedStageTheme } from '@/lib/slideshow/stage-theme';
import { stageColours } from '@/lib/slideshow/stage-colours';
import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  fnv1a32,
  generatePlaylist,
  rotateLeftBy,
  shuffleInPlace,
  shuffleInPlaceSeeded,
  expandPlaylistToLength,
} from '@/lib/slideshow/playlist';
import { findEventForSlideshow } from '@/lib/slideshow/resolve-event';
import { submissionEventIdKeys } from '@/lib/slideshow/submission-event-keys';
import { getInactiveUserEmails } from '@/lib/db/sso';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api';
import type { Event } from '@/lib/db/schemas';
import { EXCLUDE_CAP } from '@/lib/slideshow/queue';
import { SLOW_PLAYLIST_MS, createLapTimer } from '@/lib/slideshow/server-timing';
import { logWarn } from '@/lib/observability/logger';
import {
  resolveSlideshowStageAspect,
  type SlideshowStageSource,
} from '@/lib/slideshow/stage-aspect';

/** Playlist is personalized (random / instanceKey); never cache across clients or layout cells. */
export const dynamic = 'force-dynamic';

const PLAYLIST_NO_CACHE_HEADERS = {
  'Cache-Control': 'private, no-store, must-revalidate',
} as const;

function hiddenFromEventsClause(eventIdKeys: string[]): object {
  return {
    $or: [
      { hiddenFromEvents: { $exists: false } },
      { hiddenFromEvents: { $nin: eventIdKeys } },
    ],
  };
}

function accountActiveClause(inactiveEmails: Iterable<string>): object {
  return {
    $and: [
      {
        $or: [
          { userEmail: { $nin: Array.from(inactiveEmails) } },
          { userId: 'anonymous' },
        ],
      },
      {
        $or: [
          { 'userInfo.isActive': { $ne: false } },
          { userInfo: { $exists: false } },
        ],
      },
    ],
  };
}

/**
 * A plain photo (never a stored try-on result, issue 557), unless it is a vetted photo that is waiting or was rejected (camera#270): such a photo
 * has no picture yet or must stay private. Photos from before vetting carry no review status and stay in.
 */
function approvedOriginalsClause(): object {
  return {
    $and: [
      { $or: [{ submissionKind: { $exists: false } }, { submissionKind: 'original' }] },
      { reviewStatus: { $nin: ['pending_review', 'rejected'] } },
    ],
  };
}

export interface BuildPlaylistMatchFilterOptions {
  eventIdKeys: string[];
  inactiveEmails: Iterable<string>;
  excludeOids: ObjectId[];
}

/**
 * Build match filter: event + optional exclude + archived/hidden + active users only, plain photos that are not waiting or rejected.
 * (The slideshow's source mode and its hand-pinned try-on results went with the try-on integration, issue 557.)
 */
/**
 * The playlist query: the eligible pool, cut down to the fields a slide needs *before* the sort, in fairness order (least played, then oldest).
 * Without the `$project` every call read the whole pool as full documents (user info, consents, IP and device data, play history) and sorted
 * them in memory (camera#476). `instanceKey` rotation and the random order need the whole pool, so there is no `$limit`.
 */
export function buildPlaylistPipeline(matchFilter: object) {
  return [
    { $match: matchFilter },
    {
      $project: {
        _id: 1,
        imageUrl: 1,
        finalImageUrl: 1,
        screenImageUrl: 1,
        createdAt: 1,
        playCount: 1,
        hiddenFromEvents: 1,
        'metadata.finalWidth': 1,
        'metadata.originalWidth': 1,
        'metadata.finalHeight': 1,
        'metadata.originalHeight': 1,
        normalizedPlayCount: { $ifNull: ['$playCount', 0] },
      },
    },
    { $sort: { normalizedPlayCount: 1, createdAt: 1 } },
  ];
}

/** The time an admin last asked for a reload, or null: an open full-screen player that sees a different one reloads at its next slide (lib/slideshow/reload.ts). */
const reloadToken = (slideshow: Record<string, unknown>): string | null =>
  typeof slideshow.reloadRequestedAt === 'string' && slideshow.reloadRequestedAt ? slideshow.reloadRequestedAt : null;

export function buildPlaylistMatchFilter({
  eventIdKeys,
  inactiveEmails,
  excludeOids,
}: BuildPlaylistMatchFilterOptions): object {
  const and: object[] = [
    {
      $or: [
        { eventId: { $in: eventIdKeys } },
        { eventIds: { $in: eventIdKeys } },
      ],
    },
    { isArchived: { $ne: true } },
    // A picture that is gone is never shown on a screen (lib/media/broken.ts).
    { 'mediaHealth.broken': { $ne: true } },
    hiddenFromEventsClause(eventIdKeys),
    accountActiveClause(inactiveEmails),
    // Plain photos only: a stored try-on result is never on a screen, whatever its review says (issue 557).
    approvedOriginalsClause(),
  ];
  if (excludeOids.length > 0) {
    and.push({ _id: { $nin: excludeOids } });
  }
  return { $and: and };
}

/**
 * GET /api/slideshows/[slideshowId]/playlist?limit=N&exclude=id1,id2,id3
 * Generate slides with least-played logic
 * 
 * Query params:
 * - limit: Number of slides to return (default: bufferSize + 1 — current on screen plus that many upcoming)
 * - exclude: Comma-separated list of submission IDs to exclude (images in other active playlists)
 * - instanceKey: Optional stable id (e.g. layout region). With orderMode random, each key gets an
 *   independent shuffle per request (seed = hash(key) XOR per-request salt) so duplicate slideshows in a layout differ.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slideshowId: string }> }
) {
  const startedAt = Date.now();
  const timer = createLapTimer();
  try {
    await checkRateLimit(request, RATE_LIMITS.SLIDESHOW_PLAYLIST);
    timer.lap('rate');

    const { slideshowId } = await params;
    const { searchParams } = request.nextUrl;
    const limitParam = searchParams.get('limit');
    const excludeParam = searchParams.get('exclude');
    // The player sends the ids of its whole queue (at most 51); a longer list is cut so a crafted URL cannot make the query heavy.
    const excludeIds = excludeParam ? excludeParam.split(',').filter(id => id.trim()).slice(0, EXCLUDE_CAP) : [];
    const rawInstanceKey = searchParams.get('instanceKey')?.trim() ?? '';
    const instanceKey =
      rawInstanceKey.length > 256 ? rawInstanceKey.slice(0, 256) : rawInstanceKey;

    const db = await connectToDatabase();

    // Get slideshow details
    const slideshow = await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .findOne({ slideshowId });
    timer.lap('slideshow');

    if (!slideshow) {
      return NextResponse.json({ error: 'Slideshow not found' }, { status: 404 });
    }

    if (slideshow.isActive === false) {
      return NextResponse.json(
        {
          error: 'Slideshow is inactive',
          playlist: [],
          diagnostics: {
            generationMs: Date.now() - startedAt,
            inactiveSlideshow: true,
          },
        },
        { status: 403, headers: PLAYLIST_NO_CACHE_HEADERS }
      );
    }

    // `bufferSize` = upcoming slides behind the current; total pipeline slots = upcoming + 1
    const upcomingSlots = Math.max(
      1,
      Math.min(50, Math.floor(Number(slideshow.bufferSize) || 10))
    );
    const isOnceMode = slideshow.playMode === 'once';
    /** Loop: current + N upcoming. Once: initial pass length (no +1 — no separate prefetch tail). */
    const defaultLimit = Math.min(
      100,
      isOnceMode ? upcomingSlots : upcomingSlots + 1
    );
    const limit = limitParam
      ? Math.max(1, Math.min(100, parseInt(limitParam, 10) || defaultLimit))
      : defaultLimit;

    const event = await findEventForSlideshow(db, String(slideshow.eventId));
    timer.lap('event');

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.isActive === false) {
      return NextResponse.json(
        {
          error: 'Event is inactive',
          playlist: [],
          diagnostics: {
            generationMs: Date.now() - startedAt,
            inactiveEvent: true,
          },
        },
        { status: 403, headers: PLAYLIST_NO_CACHE_HEADERS }
      );
    }

    const eventUuid = event.eventId;
    const eventMongoId = event._id!.toString();
    const dbg = process.env.NODE_ENV !== 'production';
    if (dbg) {
      console.log(`[Playlist] Slideshow stored event ref: ${slideshow.eventId}`);
      console.log(`[Playlist] Event UUID (event.eventId): ${eventUuid}`);
      console.log(`[Playlist] Event Name: ${event.name}`);
    }

    // Emails mirrored as inactive on submissions (cameraAccountDisabled); not SSO MongoDB
    const inactiveEmails = await getInactiveUserEmails();
    timer.lap('inactive');
    if (dbg) {
      console.log(`[Playlist] Filtering out ${inactiveEmails.size} inactive users`);
    }

    const excludeObjectIds =
      excludeIds.length > 0
        ? excludeIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
        : [];

    if (dbg && excludeObjectIds.length > 0) {
      console.log(
        `[Playlist] Excluding ${excludeObjectIds.length} images currently in other playlists`
      );
    }

    const eventIdKeys = submissionEventIdKeys(event as Event);

    const buildMatchFilter = (excludeOids: ObjectId[]) =>
      buildPlaylistMatchFilter({
        eventIdKeys,
        inactiveEmails,
        excludeOids,
      });

    const fetchSubmissionsSorted = async (excludeOids: ObjectId[]) => {
      const matchFilter = buildMatchFilter(excludeOids);
      return db.collection(COLLECTIONS.SUBMISSIONS).aggregate(buildPlaylistPipeline(matchFilter)).toArray();
    };

    let submissions = await fetchSubmissionsSorted(excludeObjectIds);
    if (submissions.length === 0 && excludeObjectIds.length > 0) {
      if (dbg) {
        console.log('[Playlist] Exclude exhausted pool; refetching without exclude');
      }
      submissions = await fetchSubmissionsSorted([]);
    }
    timer.lap('aggregate');

    const orderMode = slideshow.orderMode === 'random' ? 'random' : 'fixed';
    if (orderMode === 'random' && submissions.length > 1) {
      if (instanceKey) {
        const randomSalt = randomBytes(4).readUInt32BE(0);
        const seed = (fnv1a32(instanceKey) ^ randomSalt) >>> 0;
        shuffleInPlaceSeeded(submissions, seed);
      } else {
        shuffleInPlace(submissions);
      }
    } else if (instanceKey && submissions.length > 1) {
      // Fixed fairness order: without this, every layout cell starts at the same head → identical tiles.
      rotateLeftBy(submissions, fnv1a32(instanceKey) % submissions.length);
    }

    const playMode = slideshow.playMode === 'once' ? 'once' : 'loop';

    // The screen design writes its texts in the event's own font, from its messmass report style (owner, 2026-10-07).
    // The theme of the event (kept for a minute per event): the screen design writes in its font, and a screen with no colours of its own is in its colours (owner, 2026-10-09).
    const theme = await cachedStageTheme(db, event as unknown as Record<string, unknown>);
    timer.lap('theme');
    let screenDesign = null;
    if (slideshow.screenDesign) {
      const font = theme?.font ?? (await loadEventTheme(db, event as unknown as Record<string, unknown>)).font;
      screenDesign = resolveScreenDesign(slideshow.screenDesign, { family: font.family, source: font.source, url: font.url });
      // The overlay is the frame of the whole screen: if its picture is gone the stage plays plain, never an empty window or a broken tile (issue 514).
      if (screenDesign && (await brokenAddresses(db)).has(screenDesign.overlayImageUrl)) screenDesign = null;
    }

    // The phases of this call for the browser's network tab; a slow call also leaves one warning line with them (camera#476).
    const answerHeaders = () => {
      if (timer.totalMs() > SLOW_PLAYLIST_MS) {
        logWarn('slideshow.playlist_slow', 'slow playlist call', { slideshowId, ms: timer.totalMs(), phases: timer.laps, pool: submissions.length, limit });
      }
      return { ...PLAYLIST_NO_CACHE_HEADERS, 'Server-Timing': timer.header() };
    };

    const { primary: bgPrimary, accent: bgAccent } = stageColours({ primary: slideshow.backgroundPrimaryColor, accent: slideshow.backgroundAccentColor }, theme);
    const pageBackground = theme?.background ?? bgPrimary;
    const bgImage =
      typeof slideshow.backgroundImageUrl === 'string' && slideshow.backgroundImageUrl.trim()
        ? slideshow.backgroundImageUrl.trim()
        : null;
    const viewportScale = slideshow.viewportScale === 'fill' ? 'fill' : 'fit';
    const stageAspect = resolveSlideshowStageAspect(
      slideshow as SlideshowStageSource,
      event as Event
    );

    if (dbg) {
      console.log(`[Playlist] Total submissions available (after filtering): ${submissions.length}`);
      console.log(
        `[Playlist] excludeObjectIds: ${excludeObjectIds.length}, orderMode: ${orderMode}, playMode: ${playMode}`
      );
      console.log('[Playlist] First 15 submissions (order may be shuffled when random):');
      submissions.slice(0, 15).forEach((sub, i) => {
        const width = sub.metadata?.finalWidth || sub.metadata?.originalWidth || '?';
        const height = sub.metadata?.finalHeight || sub.metadata?.originalHeight || '?';
        const ratio =
          width !== '?' && height !== '?' ? (width / height).toFixed(3) : '?';
        const hidden = sub.hiddenFromEvents || [];
        console.log(
          `  ${i + 1}. ${sub._id.toString().slice(-6)} - playCount: ${sub.playCount || 0}, ${width}x${height} (${ratio}), hidden: ${hidden.length > 0 ? hidden.join(',') : 'none'}`
        );
      });
    }

    if (submissions.length === 0) {
      return NextResponse.json(
        {
        slideshow: {
          _id: slideshow._id,
          eventId: eventMongoId,
          eventUuid,
          stageAspect,
          name: slideshow.name,
          eventName: slideshow.eventName,
          transitionDurationMs: slideshow.transitionDurationMs,
          fadeDurationMs: slideshow.fadeDurationMs,
          bufferSize: slideshow.bufferSize || 10,
          refreshStrategy: slideshow.refreshStrategy || 'continuous',
          playMode,
          orderMode,
          backgroundPrimaryColor: bgPrimary,
          backgroundAccentColor: bgAccent,
          pageBackgroundColor: pageBackground,
          backgroundImageUrl: bgImage,
          viewportScale,
          screenDesign,
          crossfade: slideshow.crossfade === true,
          reloadToken: reloadToken(slideshow),
        },
        playlist: [],
        message: 'No submissions available for this event',
        diagnostics: {
          generationMs: Date.now() - startedAt,
          candidatePoolSize: 0,
          inactiveUsersFiltered: inactiveEmails.size,
          excludedPlaylistImages: excludeObjectIds.length,
        },
        },
        { headers: answerHeaders() }
      );
    }

    // Generate playlist with mosaic logic
    const rawPlaylist = generatePlaylist(submissions, limit);
    const playlist =
      playMode === 'loop' && rawPlaylist.length > 0
        ? expandPlaylistToLength(rawPlaylist, limit)
        : rawPlaylist;

    return NextResponse.json(
      {
      slideshow: {
        _id: slideshow._id,
        eventId: eventMongoId,
        eventUuid,
        stageAspect,
        name: slideshow.name,
        eventName: slideshow.eventName,
        transitionDurationMs: slideshow.transitionDurationMs,
        fadeDurationMs: slideshow.fadeDurationMs,
        bufferSize: slideshow.bufferSize || 10,
        refreshStrategy: slideshow.refreshStrategy || 'continuous',
        playMode,
        orderMode,
        backgroundPrimaryColor: bgPrimary,
        backgroundAccentColor: bgAccent,
        pageBackgroundColor: pageBackground,
        backgroundImageUrl: bgImage,
        viewportScale,
        screenDesign,
        crossfade: slideshow.crossfade === true,
        reloadToken: reloadToken(slideshow),
      },
      playlist,
      totalSubmissions: submissions.length,
      diagnostics: {
        generationMs: Date.now() - startedAt,
        candidatePoolSize: submissions.length,
        inactiveUsersFiltered: inactiveEmails.size,
        excludedPlaylistImages: excludeObjectIds.length,
        playMode,
        orderMode,
      },
      },
      { headers: answerHeaders() }
    );
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    console.error('Error generating playlist:', error);
    return NextResponse.json(
      { error: 'Failed to generate playlist' },
      { status: 500 }
    );
  }
}
