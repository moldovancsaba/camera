/**
 * Public Share Page
 * 
 * Displays shared photo submissions with Open Graph meta tags.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import type { Db } from 'mongodb';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findShareSubmission, shareStateOf, type ShareLookup } from '@/lib/submissions/share-lookup';
import PhotoStatusNotice from '@/components/share/PhotoStatusNotice';
import EventThemeScope from '@/components/theme/EventThemeScope';
import UiLanguageProvider from '@/components/i18n/UiLanguageProvider';
import { loadEventTheme } from '@/lib/theme/load';
import type { EventTheme } from '@/lib/theme/event-theme';
import PublicShell from '@/components/public/PublicPageShell';
import { Button, SimpleGrid, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import {
  normalizeEventSharePageSettings,
  sharePageText,
  type EventSharePageSettings,
} from '@/lib/events/share-page-settings';
import { DEFAULT_UI_LANGUAGE, normalizeUiLanguage, translate, type UiLanguage } from '@/lib/i18n';
import { loadEventTexts, type TextOverrides } from '@/lib/i18n/overrides';
import { formatDateTime } from '@/lib/i18n/date';

interface Props {
  params: Promise<{ id: string }>;
}

interface ShareSubmission {
  id?: string;
  imageUrl?: string;
  userName?: string;
  userInfo?: {
    name?: string | null;
    email?: string | null;
  } | null;
  createdAt?: string;
  metadata?: {
    finalWidth?: number;
    finalHeight?: number;
  };
  eventIds?: unknown[];
  eventId?: unknown;
}

const FALLBACK_SHARE_PAGE_SETTINGS: EventSharePageSettings = {
  showCreateYourOwnButton: false,
  texts: {},
};

export const dynamic = 'force-dynamic';

/** The page in the theme and the language of its event (camera#285, camera#352); a page whose event is unknown keeps the default look, in English. */
function ThemedPage({ theme, language, texts, children }: { theme: EventTheme | null; language: UiLanguage; texts?: TextOverrides | null; children: React.ReactNode }) {
  return theme ? (
    <EventThemeScope theme={theme}>
      <UiLanguageProvider language={language} texts={texts}>{children}</UiLanguageProvider>
    </EventThemeScope>
  ) : (
    <>{children}</>
  );
}

function getSubmissionEventLookupKeys(submission: Record<string, unknown>): string[] {
  const candidates = [
    ...(Array.isArray(submission.eventIds) ? submission.eventIds : []),
    submission.eventId,
  ];
  const normalized = candidates
    .map((value) => {
      if (typeof value === 'string' || value instanceof String) {
        return value.trim();
      }
      if (value && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
        return value.toString().trim();
      }
      return '';
    })
    .filter(Boolean);
  return Array.from(new Set(normalized.map((value) => value.trim()).filter((value) => value.length > 0)));
}

async function resolveEventForSubmission(
  db: Db,
  submission: Record<string, unknown>
): Promise<{ mongoId: string; name: string; sharePageSettings: EventSharePageSettings; theme: EventTheme; language: UiLanguage; texts: TextOverrides } | null> {
  const eventLookupKeys = getSubmissionEventLookupKeys(submission);
  if (!eventLookupKeys.length) {
    return null;
  }

  const orClauses: Record<string, unknown>[] = eventLookupKeys.flatMap((key) => {
    const candidates: Record<string, unknown>[] = [{ eventId: key }];
    if (ObjectId.isValid(key)) {
      candidates.push({ _id: new ObjectId(key) });
    }
    return candidates;
  });

  const eventDoc = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ $or: orClauses });
  if (!eventDoc?._id) return null;
  // The page speaks the language of the event (camera#352).
  // ... in the language of the event or of its partner, with the wordings written for them (issue 353); a failed read gives the event's own language and the dictionary.
  const loaded = await loadEventTexts(db, eventDoc).catch(() => null);
  const language = loaded?.language ?? normalizeUiLanguage(eventDoc.uiLanguage);
  const texts = loaded?.overrides ?? {};
  const name =
    typeof eventDoc.name === 'string' && eventDoc.name.trim()
      ? eventDoc.name.trim()
      : translate(language, 'meta.event', undefined, texts);
  const sharePage = eventDoc.sharePage && typeof eventDoc.sharePage === 'object'
    ? eventDoc.sharePage
    : null;
  return {
    mongoId: eventDoc._id.toString(),
    name,
    sharePageSettings: normalizeEventSharePageSettings(sharePage),
    // The page is drawn with the theme of the event (camera#285).
    theme: await loadEventTheme(db, eventDoc),
    language,
    texts,
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLegacyGuestName(value: string): boolean {
  return value.trim().toLowerCase() === 'event guest';
}

function resolveDisplayName(userName: string | null, userInfoName: string | null, language: UiLanguage, texts?: TextOverrides | null): string {
  const normalizedUserInfoName = userInfoName?.trim();
  if (normalizedUserInfoName && !isLikelyEmail(normalizedUserInfoName) && !isLegacyGuestName(normalizedUserInfoName)) {
    return normalizedUserInfoName;
  }
  const normalizedUserName = userName?.trim();
  if (normalizedUserName && !isLikelyEmail(normalizedUserName) && !isLegacyGuestName(normalizedUserName)) {
    return normalizedUserName;
  }
  return translate(language, 'sharePage.guest', undefined, texts);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    const lookup = await findShareSubmission(db, id);
    const state = shareStateOf(lookup);
    const submission = lookup?.doc ?? null;

    // A photo that is not public (pending, rejected, archived, removed from its events) gets no preview image and is not
    // indexed: a link preview must not leak what the page itself would not show (camera#262, camera#269).
    if ((state === 'waiting' || state === 'not_approved') && submission) {
      // The notice speaks the language of the event, and so does its tab title (camera#352). A failed event lookup must not cost the
      // noindex: the title is then English.
      const noticeEvent = await resolveEventForSubmission(db, submission).catch(() => null);
      const noticeLanguage = noticeEvent?.language ?? DEFAULT_UI_LANGUAGE;
      return {
        title: translate(noticeLanguage, 'sharePage.meta.yourPhoto', undefined, noticeEvent?.texts),
        // The product's description, as the root layout gives every page; here in the event's language.
        description: translate(noticeLanguage, 'meta.app.description', undefined, noticeEvent?.texts),
        robots: { index: false, follow: false },
      };
    }
    // The page is not found (a page that does not know the event), so its title is in both languages (issue 352).
    if (!submission || state !== 'visible') {
      return {
        title: `${translate(DEFAULT_UI_LANGUAGE, 'sharePage.meta.notFound')} / ${translate('hu', 'sharePage.meta.notFound')}`,
        robots: { index: false, follow: false },
      };
    }

    const event = await resolveEventForSubmission(db, submission);
    const language = event?.language ?? DEFAULT_UI_LANGUAGE;
    const eventLabel = event?.name ?? translate(language, 'sharePage.sharedPhoto', undefined, event?.texts);
    const displayName = resolveDisplayName(
      readString(submission.userName),
      readString(submission.userInfo?.name),
      language,
      event?.texts
    );
    const photoOf = translate(language, 'sharePage.meta.photoOf', { name: displayName }, event?.texts);
    const from = translate(language, 'sharePage.meta.from', { event: eventLabel }, event?.texts);
    const submissionImageUrl = readString(submission.imageUrl);
    const openGraph: NonNullable<Metadata['openGraph']> = {
      title: photoOf,
      description: from,
      type: 'website',
    };
    const twitter: NonNullable<Metadata['twitter']> = {
      card: submissionImageUrl ? 'summary_large_image' : 'summary',
      title: photoOf,
      description: from,
    };

    if (submissionImageUrl) {
      openGraph.images = [
        {
          url: submissionImageUrl,
          width: 1200,
          height: 1200,
          alt: photoOf,
        },
      ];
      twitter.images = [submissionImageUrl];
    }

    return {
      title: translate(language, 'sharePage.meta.title', { name: displayName, event: eventLabel }, event?.texts),
      description: translate(language, 'sharePage.meta.description', { event: eventLabel }, event?.texts),
      openGraph,
      twitter,
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: translate(DEFAULT_UI_LANGUAGE, 'sharePage.meta.photo'),
    };
  }
}

export default async function SharePage({ params }: Props) {
  let submission: ShareSubmission | null = null;

  let lookup: ShareLookup | null = null;
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    // The link carries the database id or the share token of a vetted photo (camera#269).
    lookup = await findShareSubmission(db, id);
    const doc = lookup?.doc ?? null;
    if (doc && typeof doc === 'object' && shareStateOf(lookup) === 'visible') {
      submission = {
        id: doc._id.toString(),
        imageUrl: readString(doc.imageUrl) ?? undefined,
        userName: typeof doc.userName === 'string' ? doc.userName : undefined,
        userInfo:
          doc.userInfo && typeof doc.userInfo === 'object'
            ? {
                name: readString((doc.userInfo as { name?: unknown }).name),
                email: readString((doc.userInfo as { email?: unknown }).email),
              }
            : undefined,
        createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : undefined,
        metadata:
          doc.metadata && typeof doc.metadata === 'object'
            ? {
                finalWidth:
                  typeof (doc.metadata as { finalWidth?: unknown }).finalWidth === 'number'
                    ? (doc.metadata as { finalWidth: number }).finalWidth
                    : undefined,
                finalHeight:
                  typeof (doc.metadata as { finalHeight?: unknown }).finalHeight === 'number'
                    ? (doc.metadata as { finalHeight: number }).finalHeight
                    : undefined,
              }
            : undefined,
        eventIds: Array.isArray(doc.eventIds) ? doc.eventIds : undefined,
        eventId: doc.eventId,
      };
    }
  } catch (error) {
    console.error('Error fetching submission:', error);
  }

  // A vetted photo reached by its token that is waiting or was not approved: a notice, never the photo (camera#269).
  const shareState = shareStateOf(lookup);
  if ((shareState === 'waiting' || shareState === 'not_approved') && lookup) {
    const noticeDb = await connectToDatabase();
    const noticeEvent = await resolveEventForSubmission(noticeDb, lookup.doc);
    const noticeLanguage = noticeEvent?.language ?? DEFAULT_UI_LANGUAGE;
    return (
      <ThemedPage theme={noticeEvent?.theme ?? null} language={noticeLanguage} texts={noticeEvent?.texts}>
        <PhotoStatusNotice
          state={shareState}
          eventName={noticeEvent?.name ?? translate(noticeLanguage, 'sharePage.sharedPhoto', undefined, noticeEvent?.texts)}
          captureHref={noticeEvent?.mongoId ? `/capture/${noticeEvent.mongoId}` : '/capture'}
          settings={noticeEvent?.sharePageSettings}
          language={noticeLanguage}
        />
      </ThemedPage>
    );
  }

  // A public photo has its picture; a link to one without is no photo page.
  if (!submission || !submission.imageUrl) {
    notFound();
  }

  const db = await connectToDatabase();
  const event = await resolveEventForSubmission(db, submission as unknown as Record<string, unknown>);
  const language = event?.language ?? DEFAULT_UI_LANGUAGE;
  const texts = event?.texts ?? null;
  const sharePageSettings = event?.sharePageSettings ?? FALLBACK_SHARE_PAGE_SETTINGS;

  // The page shows the photo itself and offers it for download. (It also showed the approved try-on pictures of the photo, the settings
  // for which are gone, until the try-on integration was removed: issue 557, docs/TRYON_REMOVED.md.)
  const photoUrl = submission.imageUrl;
  const photoLabel = translate(language, 'sharePage.cameraResult', undefined, texts);
  const downloadableImageHref = submission.id
    ? `/api/share/${submission.id}/download?variant=${encodeURIComponent(`${submission.id}:camera-result`)}`
    : null;

  // `/capture/[eventId]` expects the event document Mongo `_id`, while submissions often store public `eventId` UUID in `eventIds` / `eventId`.
  let createYourOwnHref = '/capture';
  if (event?.mongoId) {
    createYourOwnHref = `/capture/${event.mongoId}`;
  }

  const headline = event?.name ?? translate(language, 'sharePage.sharedPhoto', undefined, texts);
  return (
    <ThemedPage theme={event?.theme ?? null} language={language} texts={texts}>
    <PublicShell size="lg">
      <Stack gap="xl">
        <Stack align="center" gap="xs" ta="center">
          <Title order={1} size="1.5rem">
            {headline}
          </Title>
        </Stack>

        <div>
          <div
            style={{
              position: 'relative',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 16,
              marginInline: 'auto',
              aspectRatio:
                submission.metadata?.finalWidth && submission.metadata?.finalHeight
                  ? `${submission.metadata.finalWidth} / ${submission.metadata.finalHeight}`
                  : '1',
              maxWidth: '100%',
            }}
          >
            <Image
              src={photoUrl}
              alt={photoLabel}
              fill
              className="object-contain"
              unoptimized
            />
          </div>

          <Text size="sm" c="dimmed" ta="right" mb="lg">
            {submission.createdAt ? formatDateTime(submission.createdAt, language) : ''}
          </Text>

          {/* The two buttons sit one under the other on a phone: side by side, half a phone wide, the themed capitals of "Download" and of a
              Hungarian label were clipped (camera#352). Side by side again from the small breakpoint up; a single button is always full width. */}
          <SimpleGrid cols={{ base: 1, xs: sharePageSettings.showCreateYourOwnButton ? 2 : 1 }} spacing="md">
            {downloadableImageHref ? (
              <Button
                component="a"
                href={downloadableImageHref}
                download
                size="lg"
              >
                {sharePageText(sharePageSettings, 'downloadButton', language, texts)}
              </Button>
            ) : (
              <Button size="lg" disabled>
                {sharePageText(sharePageSettings, 'downloadButton', language, texts)}
              </Button>
            )}
            {sharePageSettings.showCreateYourOwnButton ? (
              <Button component="a" href={createYourOwnHref} variant="default" size="lg">
                {sharePageText(sharePageSettings, 'createYourOwnButton', language, texts)}
              </Button>
            ) : null}
          </SimpleGrid>
        </div>
      </Stack>
    </PublicShell>
    </ThemedPage>
  );
}
