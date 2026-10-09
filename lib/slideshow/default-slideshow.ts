/**
 * The default slideshow of an event (camera#327, docs/BUILDING_BRICKS.md 6.2 and 8, owner decisions 110-121 and 165-169): a giant-screen design every event gets without anyone
 * making it. It is made of the stage layout (lib/screen/default-stage.ts), the event's own colours, a QR code that points at a tracked "Giant screen" link of the event, one
 * one line under the window, the written address (the event's own short address when it has one, else the tracked link's), as wide as the window and scaled to fill it. It is added next to the event's other slideshows and flagged
 * `isDefault`: the welcome page screen and the giant screen start from it, an editor changes it or makes another and sets that as the default.
 *
 * Idempotent: an event that already has a default slideshow gets nothing new, an existing "Giant screen" link is reused, so a retry after a failure leaves no second copy. The
 * picture and the link are made before the slideshow is written, so a failure leaves nothing half-made that an editor could see. Dependencies are injected so it is unit-tested
 * without Blob, a network or a database.
 */

import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';
import type { Db, Document } from 'mongodb';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { translate, normalizeUiLanguage } from '@/lib/i18n';
import { withEffectiveLanguage } from '@/lib/i18n/overrides';
import { DEFAULT_STAGE, renderDefaultOverlay, stagePalette } from '@/lib/screen/default-stage';
import { createShortLink, listShortLinks } from '@/lib/short-links/store';
import { defaultGoShortOrigin } from '@/lib/site-hosts';
import { loadEventTheme } from '@/lib/theme/load';

/** The name of the tracked link behind the QR code of the default screen, as the event's links list shows it. */
export const GIANT_SCREEN_PLACEMENT = 'Giant screen';

export interface DefaultSlideshowDeps {
  /** Stores the picture of the stage and returns its public https address. */
  upload: (pathname: string, png: Buffer) => Promise<string>;
  origin: () => string;
  now: () => string;
}

const defaultDeps: DefaultSlideshowDeps = {
  upload: async (pathname, png) => (await put(pathname, png, { access: 'public', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 })).url,
  origin: defaultGoShortOrigin,
  now: generateTimestamp,
};

export type EnsureResult = { ok: true; slideshowId: string; created: boolean } | { ok: false; reason: string };

/** The default slideshow of an event (the slideshow's event id is the event's UUID), or null. */
export async function findDefaultSlideshow(db: Db, eventUuid: string): Promise<Document | null> {
  return db.collection(COLLECTIONS.SLIDESHOWS).findOne({ eventId: eventUuid, isDefault: true });
}

/**
 * The address written under the photos (owner, 2026-10-09): the event's own short address (`shortUrlSlug`, e.g. go.messmass.com/mtk-vasas) whenever it has one, else the slug of the
 * tracked "Giant screen" link. It is the public address without the protocol. The QR code keeps pointing at the tracked link, so its scans are still counted on their own.
 */
export function writtenAddress(origin: string, event: Document, linkSlug: string): string {
  const own = typeof event.shortUrlSlug === 'string' ? event.shortUrlSlug.trim() : '';
  return `${origin.replace(/^https?:\/\//, '')}/${own || linkSlug}`;
}

/** Makes the default slideshow of the event unless it has one. `event` is the stored event (its `_id`, `eventId`, `name`, `uiLanguage`, `frameDesign`). */
export async function ensureDefaultSlideshow(db: Db, event: Document, deps: DefaultSlideshowDeps = defaultDeps): Promise<EnsureResult> {
  const eventUuid = String(event.eventId ?? '');
  const mongoId = String(event._id ?? '');
  if (!eventUuid || !mongoId) return { ok: false, reason: 'The event has no id.' };

  const existing = await findDefaultSlideshow(db, eventUuid);
  if (existing) return { ok: true, slideshowId: String(existing.slideshowId), created: false };

  // The link: the event's own "Giant screen" QR link when it has one, else a new one. Its slug is the whole address on the screen.
  const links = await listShortLinks(db, mongoId);
  let slug = links.find((link) => link.placement === GIANT_SCREEN_PLACEMENT && link.kind === 'qr' && link.active)?.slug;
  if (!slug) {
    const made = await createShortLink(db, mongoId, { placement: GIANT_SCREEN_PLACEMENT, kind: 'qr' });
    if (!made.ok) return { ok: false, reason: made.error };
    slug = made.link.slug;
  }
  const origin = deps.origin();

  const theme = await loadEventTheme(db, event);
  const colours = { background: theme.background, accent: theme.buttonBackground };
  const palette = stagePalette(colours);
  const png = renderDefaultOverlay(colours);
  const overlayImageUrl = await deps.upload(`screens/${eventUuid}/default-${createHash('sha256').update(png).digest('hex').slice(0, 16)}.png`, png);

  // The language of the event, or of its partner when the event has none (issue 353).
  const language = normalizeUiLanguage((await withEffectiveLanguage(db, event)).uiLanguage);
  const { window, qr, addressText } = DEFAULT_STAGE;
  const now = deps.now();
  const slideshowId = generateId();
  await db.collection(COLLECTIONS.SLIDESHOWS).insertOne({
    slideshowId,
    eventId: eventUuid,
    eventName: String(event.name ?? ''),
    name: translate(language, 'screen.slideshow.name'),
    isActive: true,
    isDefault: true,
    transitionDurationMs: 5000,
    fadeDurationMs: 1000,
    bufferSize: 10,
    refreshStrategy: 'continuous',
    playMode: 'loop',
    orderMode: 'fixed',
    backgroundPrimaryColor: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY,
    backgroundAccentColor: SLIDESHOW_DEFAULT_BACKGROUND_ACCENT,
    backgroundImageUrl: null,
    viewportScale: 'fit',
    submissionSourceMode: 'originals_only',
    screenDesign: {
      overlayImageUrl,
      window: { ...window },
      photoFit: 'cover',
      qr: { url: `${origin}/${slug}`, x: qr.x, y: qr.y, size: qr.size, color: palette.qr },
      texts: [
        { text: writtenAddress(origin, event, slug), x: addressText.x, y: addressText.y, width: addressText.width, size: addressText.size, align: 'center', fit: true, color: palette.text },
      ],
    },
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, slideshowId, created: true };
}
