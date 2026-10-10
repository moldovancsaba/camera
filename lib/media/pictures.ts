/**
 * The rule of lib/media/broken.ts for every picture that is not a guest's photo (issue 514; owner, 2026-10-09: "for any item"): the logo of an event or partner, a frame, a picture of a page, the
 * giant screen's overlay, the picture under the e-mails. A picture that its host no longer has is never shown as an error; it is left out, and a picture that answers again comes back.
 *
 * Photos keep their own mark (`Submission.mediaHealth`, which the one visibility rule reads). These pictures have no row of their own to mark, so the registry is the address: `picture_health`
 * holds one row for each address that was checked (`_id` is the address), with where it is used. The guest pages read the few broken ones (`brokenAddresses`, kept for a minute per server)
 * and leave them out of what they send. Only a clear "gone" marks an address (`checkPicture`: 404, 410, or not an image); a timeout or a refusal changes nothing. Nothing is deleted.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isAllowedLogoUrl } from '@/lib/frame/logo';
import { checkPicture, type PictureCheck } from '@/lib/media/broken';

export interface PictureHealth {
  _id: string;
  broken: boolean;
  /** Why it is broken (`the picture is gone (http 404)`), empty when it is fine. */
  reason: string;
  checkedAt: string;
  /** Where the address is used, e.g. `events: MTK x Vasas`, at most 5 (an admin needs a place to look, not the full list). */
  where: string[];
}

/** The collections whose documents hold picture addresses of the pages, the screens and the e-mails (photos are not here: they have their own mark). */
const SOURCES = [COLLECTIONS.EVENTS, COLLECTIONS.PARTNERS, COLLECTIONS.LOGOS, COLLECTIONS.IMAGES, COLLECTIONS.FRAMES, COLLECTIONS.LANDING_PAGES, COLLECTIONS.SLIDESHOWS] as const;

/** A field holds a picture when its path says so (`logoUrl`, `config.backgroundImageUrl`, `welcomeScreen.url`, `screenDesign.overlayImageUrl`). Other addresses (a link, a font file) are never checked. */
const PICTURE_PATH = /image|logo|picture|thumbnail|background|overlay|screen/i;

const MAX_DEPTH = 8;

/** Collects every picture address in a document. Only addresses of our image hosts count (`isAllowedLogoUrl`). */
function addressesIn(value: unknown, path: string, found: Set<string>, depth = 0): void {
  if (depth > MAX_DEPTH) return;
  if (typeof value === 'string') {
    if (PICTURE_PATH.test(path) && isAllowedLogoUrl(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) addressesIn(item, path, found, depth + 1);
  } else if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, inner] of Object.entries(value)) addressesIn(inner, path ? `${path}.${key}` : key, found, depth + 1);
  }
}

/** Every picture address used by an event, partner, logo, library image, frame, landing page or slideshow, with up to 5 places it is used. */
export async function collectPictureAddresses(db: Db): Promise<Map<string, string[]>> {
  const used = new Map<string, string[]>();
  for (const name of SOURCES) {
    const documents = await db.collection(name).find({}).toArray();
    for (const document of documents) {
      const found = new Set<string>();
      addressesIn(document, '', found);
      const label = `${name}: ${String(document.name ?? document.title ?? document.slug ?? document._id).slice(0, 60)}`;
      for (const address of found) {
        const where = used.get(address) ?? [];
        if (where.length < 5 && !where.includes(label)) where.push(label);
        used.set(address, where);
      }
    }
  }
  return used;
}

export interface PictureScan {
  processed: number;
  broken: number;
  cleared: number;
  unknown: number;
  /** Addresses still due for a check after this batch (not checked in the last `maxAgeDays` days). */
  remaining: number;
}

const SCAN_DEFAULT = 50;
const SCAN_MAX = 100;
const CONCURRENT = 6;

/**
 * One bounded batch of the check: the addresses in use that were not checked in the last `maxAgeDays` days (never-checked first), asked of their own host and recorded. Repeat until `remaining` is 0
 * (the admin card does, and the daily cron until its time is used). An answer that cannot be told leaves the earlier answer as it was.
 */
export async function scanPictures(
  db: Db,
  options: { limit?: number; maxAgeDays?: number; now?: Date } = {},
  check: (url: string) => Promise<PictureCheck> = checkPicture
): Promise<PictureScan> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.maxAgeDays ?? 6) * 86_400_000).toISOString();
  const limit = Math.min(SCAN_MAX, Math.max(1, Math.floor(options.limit ?? SCAN_DEFAULT)));
  const used = await collectPictureAddresses(db);
  const rows = await db.collection<PictureHealth>(COLLECTIONS.PICTURE_HEALTH).find({}).toArray();
  const last = new Map(rows.map((row) => [row._id, row]));
  const due = [...used.keys()].filter((address) => (last.get(address)?.checkedAt ?? '') < cutoff).sort((a, b) => (last.get(a)?.checkedAt ?? '').localeCompare(last.get(b)?.checkedAt ?? ''));
  const batch = due.slice(0, limit);
  const result: PictureScan = { processed: batch.length, broken: 0, cleared: 0, unknown: 0, remaining: due.length - batch.length };
  const health = db.collection<PictureHealth>(COLLECTIONS.PICTURE_HEALTH);
  for (let i = 0; i < batch.length; i += CONCURRENT) {
    await Promise.all(
      batch.slice(i, i + CONCURRENT).map(async (address) => {
        const answer = await check(address);
        const earlier = last.get(address);
        const where = used.get(address) ?? [];
        const at = now.toISOString();
        if (answer === 'unknown') {
          // Not told: the earlier answer stays, but the try is recorded, so a host that is down for a while does not keep a batch (and the admin's loop) on the same addresses.
          result.unknown += 1;
          await health.updateOne({ _id: address }, { $set: earlier ? { checkedAt: at, where } : { broken: false, reason: '', checkedAt: at, where } }, { upsert: true });
          return;
        }
        const broken = answer === 'broken';
        await health.updateOne({ _id: address }, { $set: { broken, reason: broken ? 'the picture is gone (http 404)' : '', checkedAt: at, where } }, { upsert: true });
        if (broken) result.broken += 1;
        else if (earlier?.broken) result.cleared += 1;
      })
    );
  }
  clearBrokenCache();
  return result;
}

const CACHE_MS = 60_000;
let cache: { at: number; set: Set<string> } | null = null;

export function clearBrokenCache(): void {
  cache = null;
}

/** The addresses that are gone right now, kept for a minute on each server so a guest page costs one small read at most once a minute. */
export async function brokenAddresses(db: Db, nowMs: number = Date.now()): Promise<Set<string>> {
  if (cache && nowMs - cache.at < CACHE_MS) return cache.set;
  const rows = await db.collection<PictureHealth>(COLLECTIONS.PICTURE_HEALTH).find({ broken: true }).toArray();
  cache = { at: nowMs, set: new Set(rows.map((row) => row._id)) };
  return cache.set;
}

/** The picture, or null when it is gone (or there is none). */
export function pictureOrNull(url: string | null | undefined, broken: ReadonlySet<string>): string | null {
  return typeof url === 'string' && url && !broken.has(url) ? url : null;
}

/**
 * A copy of what a guest page is sent without the pictures that are gone: a field whose value is a broken address is left out, and so is such an address in a list. Plain objects and lists only
 * (dates and ids are passed on as they are). Nothing broken: the same value comes back untouched.
 */
export function withoutBroken<T>(value: T, broken: ReadonlySet<string>): T {
  if (broken.size === 0) return value;
  const walk = (inner: unknown): unknown => {
    if (Array.isArray(inner)) return inner.filter((item) => !(typeof item === 'string' && broken.has(item))).map(walk);
    if (inner && typeof inner === 'object' && Object.getPrototypeOf(inner) === Object.prototype) {
      return Object.fromEntries(Object.entries(inner).filter(([, v]) => !(typeof v === 'string' && broken.has(v))).map(([k, v]) => [k, walk(v)]));
    }
    return inner;
  };
  return walk(value) as T;
}

/** The addresses that are gone, with where each is used, for the admin card. */
export async function brokenPictureRows(db: Db): Promise<Array<{ url: string; reason: string; checkedAt: string; where: string[] }>> {
  const rows = await db.collection<PictureHealth>(COLLECTIONS.PICTURE_HEALTH).find({ broken: true }).toArray();
  return rows.map((row: Document) => ({ url: String(row._id), reason: String(row.reason ?? ''), checkedAt: String(row.checkedAt ?? ''), where: Array.isArray(row.where) ? (row.where as string[]) : [] }));
}
