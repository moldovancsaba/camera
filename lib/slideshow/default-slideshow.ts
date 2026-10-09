/**
 * The default slideshow of an event (camera#327, docs/BUILDING_BRICKS.md 6.2 and 8, owner decisions 110-121 and 165-169): a giant-screen design every event gets without anyone
 * making it. It is made of the stage layout (lib/screen/default-stage.ts), the event's own colours, a QR code that points at a tracked "Giant screen" link of the event, one
 * short call to action picked once at random from the dictionary, and the written address of the link under the window. It is added next to the event's other slideshows and flagged
 * `isDefault`: the welcome page screen and the giant screen start from it, an editor changes it or makes another and sets that as the default.
 *
 * Idempotent: an event that already has a default slideshow gets nothing new, an existing "Giant screen" link is reused, so a retry after a failure leaves no second copy. The
 * picture and the link are made before the slideshow is written, so a failure leaves nothing half-made that an editor could see. Dependencies are injected so it is unit-tested
 * without Blob, a network or a database.
 */

import { createHash, randomInt } from 'node:crypto';
import { put } from '@vercel/blob';
import type { Db, Document } from 'mongodb';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { translate, normalizeUiLanguage, type MessageKey } from '@/lib/i18n';
import { withEffectiveLanguage } from '@/lib/i18n/overrides';
import { DEFAULT_STAGE, renderDefaultOverlay, stagePalette } from '@/lib/screen/default-stage';
import { createShortLink, listShortLinks } from '@/lib/short-links/store';
import { defaultGoShortOrigin } from '@/lib/site-hosts';
import { loadEventTheme } from '@/lib/theme/load';

/** The name of the tracked link behind the QR code of the default screen, as the event's links list shows it. */
export const GIANT_SCREEN_PLACEMENT = 'Giant screen';

/** The calls to action the default screen picks from (one is stored per event, so a screen does not change between visits). Each fits the QR panel's width on one line. */
export const QR_TEXT_KEYS: readonly MessageKey[] = ['screen.qrText.1', 'screen.qrText.2', 'screen.qrText.3', 'screen.qrText.4'];

export interface DefaultSlideshowDeps {
  /** Stores the picture of the stage and returns its public https address. */
  upload: (pathname: string, png: Buffer) => Promise<string>;
  /** A whole number from 0 up to, not including, `max`. */
  pickIndex: (max: number) => number;
  origin: () => string;
  now: () => string;
}

const defaultDeps: DefaultSlideshowDeps = {
  upload: async (pathname, png) => (await put(pathname, png, { access: 'public', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 })).url,
  pickIndex: (max) => randomInt(max),
  origin: defaultGoShortOrigin,
  now: generateTimestamp,
};

export type EnsureResult = { ok: true; slideshowId: string; created: boolean } | { ok: false; reason: string };

/** The default slideshow of an event (the slideshow's event id is the event's UUID), or null. */
export async function findDefaultSlideshow(db: Db, eventUuid: string): Promise<Document | null> {
  return db.collection(COLLECTIONS.SLIDESHOWS).findOne({ eventId: eventUuid, isDefault: true });
}

/** The written address of a link: the public address without the protocol. */
const written = (origin: string, slug: string): string => `${origin.replace(/^https?:\/\//, '')}/${slug}`;

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
  const { window, qr, qrText, urlText } = DEFAULT_STAGE;
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
        { text: translate(language, QR_TEXT_KEYS[deps.pickIndex(QR_TEXT_KEYS.length)]), x: qrText.x, y: qrText.y, width: qrText.width, size: qrText.size, align: 'center', color: palette.text },
        { text: written(origin, slug), x: urlText.x, y: urlText.y, width: urlText.width, size: urlText.size, align: 'center', color: palette.text },
      ],
    },
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, slideshowId, created: true };
}
