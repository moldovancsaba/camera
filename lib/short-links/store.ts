/**
 * Tracked short links (camera#320): one link per placement of an event (the giant screen QR, a poster, an email), each counted on its own, all of
 * them going to the capture page of the event through go.messmass.com/<slug>. The links live in `short_links`; the visits are counted in
 * `short_link_hits`, one row per link, day and kind of phone, bumped with `$inc` (no row per visit). The event's own short URL (`shortUrlSlug`) is
 * counted into the same rows as a plain link, so every visit through go.messmass.com can be added up.
 */

import { randomInt } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isReservedGoShortSlug, normalizeGoShortSlugInput } from '@/lib/go-short-url';
import type { HitDevice } from './device';
import type { HitRow, LinkKind } from './totals';

export interface ShortLinkDoc {
  slug: string;
  /** Mongo _id of the camera event, as a string. */
  eventId: string;
  /** What the link is for, in the admin's words (e.g. "Giant screen"). */
  placement: string;
  /** `qr` is printed or shown as a QR code (counted as scans, with the phone split); `link` is a plain link (counted as clicks). */
  kind: LinkKind;
  active: boolean;
  createdAt: string;
}

export const MAX_LINKS_PER_EVENT = 20;
export const MAX_PLACEMENT_LENGTH = 60;

/** No 0/o, 1/l/i: a slug is read aloud and typed from a poster now and then, and a short one keeps the QR code coarse. */
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const SLUG_LENGTH = 6;

export function randomSlug(pick: (max: number) => number = randomInt): string {
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i += 1) slug += SLUG_ALPHABET[pick(SLUG_ALPHABET.length)];
  return slug;
}

export type NewLink = { ok: true; placement: string; kind: LinkKind; slug: string | null } | { ok: false; error: string };

/** The admin's input for a new link: a placement name (1 to 60 characters), a kind, and optionally a chosen slug. Pure. */
export function parseNewLink(input: unknown): NewLink {
  const v = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const placement = typeof v.placement === 'string' ? v.placement.replace(/\s+/g, ' ').trim() : '';
  if (!placement || placement.length > MAX_PLACEMENT_LENGTH || /[\u0000-\u001f]/.test(placement)) {
    return { ok: false, error: `The placement needs a name of 1 to ${MAX_PLACEMENT_LENGTH} characters.` };
  }
  if (v.kind !== 'qr' && v.kind !== 'link') return { ok: false, error: 'The kind must be "qr" or "link".' };
  const slug = normalizeGoShortSlugInput(v.slug);
  if (!slug.ok) return { ok: false, error: slug.error };
  return { ok: true, placement, kind: v.kind, slug: slug.slug };
}

/** True when a tracked link already uses the slug (the event routes check this before they accept a short URL or greatest-hits address). */
export async function trackedSlugExists(db: Db, slug: string): Promise<boolean> {
  return !!(await db.collection(COLLECTIONS.SHORT_LINKS).findOne({ slug }, { projection: { _id: 1 } }));
}

/** True when the slug is used by a tracked link, by an event's own short URL, or by an event's greatest-hits address. */
export async function slugTaken(db: Db, slug: string): Promise<boolean> {
  if (isReservedGoShortSlug(slug)) return true;
  if (await db.collection(COLLECTIONS.SHORT_LINKS).findOne({ slug }, { projection: { _id: 1 } })) return true;
  return !!(await db.collection(COLLECTIONS.EVENTS).findOne({ $or: [{ shortUrlSlug: slug }, { greatestHitsSlug: slug }] }, { projection: { _id: 1 } }));
}

export type CreateResult = { ok: true; link: ShortLinkDoc } | { ok: false; status: number; error: string };

export async function createShortLink(db: Db, eventId: string, input: unknown, now: Date = new Date()): Promise<CreateResult> {
  const parsed = parseNewLink(input);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const links = db.collection<ShortLinkDoc>(COLLECTIONS.SHORT_LINKS);
  if ((await links.countDocuments({ eventId })) >= MAX_LINKS_PER_EVENT) {
    return { ok: false, status: 409, error: `An event can have at most ${MAX_LINKS_PER_EVENT} tracked links.` };
  }

  let slug = parsed.slug;
  if (slug) {
    if (await slugTaken(db, slug)) return { ok: false, status: 409, error: 'This slug is already used. Choose another.' };
  } else {
    for (let attempt = 0; attempt < 8 && !slug; attempt += 1) {
      const candidate = randomSlug();
      if (!(await slugTaken(db, candidate))) slug = candidate;
    }
    if (!slug) return { ok: false, status: 503, error: 'No free slug was found. Try again.' };
  }

  const link: ShortLinkDoc = { slug, eventId, placement: parsed.placement, kind: parsed.kind, active: true, createdAt: now.toISOString() };
  await links.insertOne({ ...link });
  return { ok: true, link };
}

export async function listShortLinks(db: Db, eventId: string): Promise<ShortLinkDoc[]> {
  const rows = await db.collection<ShortLinkDoc>(COLLECTIONS.SHORT_LINKS).find({ eventId }).sort({ createdAt: 1 }).toArray();
  return rows.map(({ slug, eventId: id, placement, kind, active, createdAt }) => ({ slug, eventId: id, placement, kind, active: active !== false, createdAt }));
}

/** Switch a link off or on. An inactive link answers 404 like an unknown one; its counts stay. Returns false when the event has no such link. */
export async function setShortLinkActive(db: Db, eventId: string, slug: string, active: boolean): Promise<boolean> {
  const result = await db.collection(COLLECTIONS.SHORT_LINKS).updateOne({ eventId, slug }, { $set: { active } });
  return result.matchedCount === 1;
}

export async function hasTrackedLinks(db: Db, eventId: string): Promise<boolean> {
  return !!(await db.collection(COLLECTIONS.SHORT_LINKS).findOne({ eventId }, { projection: { _id: 1 } }));
}

/** An active tracked link by slug, with the event it leads to (null for an unknown, inactive or orphaned link). */
export async function resolveTrackedLink(db: Db, slug: string): Promise<{ link: ShortLinkDoc; event: { _id: ObjectId; messmassEventId?: string | null } } | null> {
  const link = await db.collection<ShortLinkDoc>(COLLECTIONS.SHORT_LINKS).findOne({ slug, active: { $ne: false } });
  if (!link || !ObjectId.isValid(link.eventId)) return null;
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(link.eventId) }, { projection: { _id: 1, messmassEventId: 1 } });
  return event ? { link, event: event as { _id: ObjectId; messmassEventId?: string | null } } : null;
}

/** One counted visit: a row per link, day (UTC) and kind of phone, bumped by one. */
export async function recordHit(db: Db, hit: { slug: string; eventId: string; kind: LinkKind; device: HitDevice }, now: Date = new Date()): Promise<void> {
  await db.collection(COLLECTIONS.SHORT_LINK_HITS).updateOne(
    { slug: hit.slug, day: now.toISOString().slice(0, 10), device: hit.device },
    { $inc: { count: 1 }, $setOnInsert: { eventId: hit.eventId, kind: hit.kind } },
    { upsert: true },
  );
}

/** The counted visits of an event by kind and phone, summed over every link and day. */
export async function hitRowsForEvent(db: Db, eventId: string): Promise<HitRow[]> {
  const rows = await db
    .collection(COLLECTIONS.SHORT_LINK_HITS)
    .aggregate<{ _id: { kind: LinkKind; device: HitDevice }; count: number }>([
      { $match: { eventId } },
      { $group: { _id: { kind: '$kind', device: '$device' }, count: { $sum: '$count' } } },
    ])
    .toArray();
  return rows.map((row) => ({ kind: row._id.kind, device: row._id.device, count: row.count }));
}

export interface LinkCounts {
  total: number;
  android: number;
  iphone: number;
  other: number;
  today: number;
}

/** The counted visits of every link of an event (and of its own short URL), by slug. `today` is the UTC day of `now`. */
export async function hitCountsBySlug(db: Db, eventId: string, now: Date = new Date()): Promise<Record<string, LinkCounts>> {
  const day = now.toISOString().slice(0, 10);
  const rows = await db
    .collection(COLLECTIONS.SHORT_LINK_HITS)
    .aggregate<{ _id: { slug: string; device: HitDevice; day: string }; count: number }>([
      { $match: { eventId } },
      { $group: { _id: { slug: '$slug', device: '$device', day: '$day' }, count: { $sum: '$count' } } },
    ])
    .toArray();
  const out: Record<string, LinkCounts> = {};
  for (const row of rows) {
    const entry = (out[row._id.slug] ??= { total: 0, android: 0, iphone: 0, other: 0, today: 0 });
    entry.total += row.count;
    entry[row._id.device] += row.count;
    if (row._id.day === day) entry.today += row.count;
  }
  return out;
}
