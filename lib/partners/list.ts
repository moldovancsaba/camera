/**
 * The partner list of the admin (camera#375): alphabetical, in pages, and the counts of a page from three grouped queries instead of three queries for every row.
 * The order is a collation on the name (case does not count; an accent is only a tie-breaker, so "Árpád" stands with the A's), then the partner id so two partners with the
 * same name keep a fixed place from page to page.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export const PARTNERS_PAGE_SIZE = 50;
export const PARTNER_COLLATION = { locale: 'hu', strength: 2 } as const;
export const PARTNER_ORDER = { name: 1, partnerId: 1 } as const;

export interface PartnerCounts {
  events: number;
  frames: number;
  users: number;
}

/** The page asked for (`?page=3`) as a number in 1..pages: anything that is not a positive whole number is the first page, a page past the end is the last. */
export function pageNumber(raw: string | undefined, pages: number): number {
  const asked = /^\d{1,6}$/.test(raw ?? '') ? Number(raw) : 1;
  return Math.min(Math.max(1, asked), Math.max(1, pages));
}

/** Events, distinct frames assigned to those events (assignment lives on the event) and active users of each partner, in three queries whatever the number of partners. */
export async function partnerCounts(db: Db, partnerIds: string[]): Promise<Map<string, PartnerCounts>> {
  const counts = new Map<string, PartnerCounts>(partnerIds.map((id) => [id, { events: 0, frames: 0, users: 0 }]));
  if (partnerIds.length === 0) return counts;
  const [events, frames, users] = await Promise.all([
    db.collection(COLLECTIONS.EVENTS).aggregate<{ _id: string; n: number }>([{ $match: { partnerId: { $in: partnerIds } } }, { $group: { _id: '$partnerId', n: { $sum: 1 } } }]).toArray(),
    db
      .collection(COLLECTIONS.EVENTS)
      .aggregate<{ _id: string; n: number }>([
        { $match: { partnerId: { $in: partnerIds } } },
        { $unwind: '$frames' },
        { $group: { _id: { partnerId: '$partnerId', frameId: '$frames.frameId' } } },
        { $group: { _id: '$_id.partnerId', n: { $sum: 1 } } },
      ])
      .toArray(),
    db.collection(COLLECTIONS.PARTNER_USER_ACCESS).aggregate<{ _id: string; n: number }>([{ $match: { partnerId: { $in: partnerIds }, isActive: true } }, { $group: { _id: '$partnerId', n: { $sum: 1 } } }]).toArray(),
  ]);
  for (const row of events) if (counts.has(row._id)) counts.get(row._id)!.events = row.n;
  for (const row of frames) if (counts.has(row._id)) counts.get(row._id)!.frames = row.n;
  for (const row of users) if (counts.has(row._id)) counts.get(row._id)!.users = row.n;
  return counts;
}
