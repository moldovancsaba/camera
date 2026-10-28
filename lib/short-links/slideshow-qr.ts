import type { Db, Document } from 'mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { createShortLink, listShortLinks } from './store';

type ScreenDesign = {
  overlayImageUrl?: unknown;
  window?: unknown;
  photoFit?: unknown;
  qr?: { url?: unknown; [key: string]: unknown } | null;
  [key: string]: unknown;
};

export type SlideshowQrRepair =
  | { ok: true; changed: false }
  | { ok: true; changed: true; url: string }
  | { ok: false; reason: string };

function slugAtOrigin(value: unknown, origin: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    const target = new URL(value);
    if (target.origin !== new URL(origin).origin) return null;
    const parts = target.pathname.split('/').filter(Boolean);
    return parts.length === 1 ? decodeURIComponent(parts[0]).trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * A first-party QR in a default slideshow must point to an active QR-kind short link owned by this event.
 * Older slideshows can point at the event's public slug (which is counted as a regular link), so repair
 * that attribution before returning the screen to a player or an admin operation.
 */
export async function repairDefaultSlideshowQr(
  db: Db,
  event: Document,
  slideshow: Document,
  origin: string,
  now: string = generateTimestamp(),
): Promise<SlideshowQrRepair> {
  if (slideshow.isDefault !== true) return { ok: true, changed: false };
  const design = slideshow.screenDesign as ScreenDesign | undefined;
  const currentUrl = design?.qr?.url;
  const slug = slugAtOrigin(currentUrl, origin);
  if (!slug) return { ok: true, changed: false };

  const eventShortUrl =
    typeof event.shortUrlSlug === 'string' ? event.shortUrlSlug.trim().toLowerCase() : '';
  if (!eventShortUrl || slug !== eventShortUrl) return { ok: true, changed: false };

  const eventId = String(event._id ?? '');
  const links = await listShortLinks(db, eventId);
  let qrLink = links.find((link) => link.placement === 'Giant screen' && link.kind === 'qr' && link.active);
  qrLink ??= links.find((link) => link.kind === 'qr' && link.active);
  if (!qrLink) {
    const created = await createShortLink(db, eventId, { placement: 'Giant screen', kind: 'qr' });
    if (!created.ok) {
      return {
        ok: false,
        reason: `The slideshow QR cannot be tracked until an active QR link is available: ${created.error}`,
      };
    }
    qrLink = created.link;
  }

  const repairedUrl = `${origin.replace(/\/$/, '')}/${qrLink.slug}`;
  const update = await db.collection(COLLECTIONS.SLIDESHOWS).updateOne(
    { _id: slideshow._id, isDefault: true, 'screenDesign.qr.url': currentUrl },
    { $set: { 'screenDesign.qr.url': repairedUrl, updatedAt: now, reloadRequestedAt: now } },
  );
  if (update.matchedCount === 0) return { ok: true, changed: false };
  return { ok: true, changed: true, url: repairedUrl };
}

/** First-party slideshow QR URLs must resolve to an active QR-kind link belonging to the same event. */
export async function isTrackedQrForEvent(db: Db, eventId: string, value: unknown, origin: string): Promise<boolean> {
  if (typeof value !== 'string') return false;
  let target: URL;
  try {
    target = new URL(value);
    if (target.origin !== new URL(origin).origin) return true;
  } catch {
    return false;
  }
  const parts = target.pathname.split('/').filter(Boolean);
  if (parts.length !== 1) return false;
  let slug = '';
  try {
    slug = decodeURIComponent(parts[0]).trim().toLowerCase();
  } catch {
    return false;
  }
  if (!slug) return false;
  const link = await db.collection(COLLECTIONS.SHORT_LINKS).findOne(
    { slug, eventId, kind: 'qr', active: { $ne: false } },
    { projection: { _id: 1 } },
  );
  return Boolean(link);
}
