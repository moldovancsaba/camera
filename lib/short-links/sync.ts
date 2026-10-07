/**
 * Pushes the totals of an event's tracked links to messmass (camera#320): visitQrCode, visitShortUrl, qrscanAndroid, qrscanIphone, as whole totals
 * every time (messmass adds them to what the stats held before camera's first report, and a repeated report changes nothing).
 *
 * Camera has no scheduled job, so the push rides on the traffic: after a counted visit, and when the admin opens the links panel. To keep a busy
 * stadium from calling messmass on every scan, an event is pushed at most once per `SYNC_THROTTLE_MS`: the slot is claimed with one atomic update of
 * `event.shortLinkSync.pushedAt`, so visits arriving together make one push. The totals of the last good push are kept next to it; a push that would
 * say nothing new is not made. A visit that arrives inside the window is pushed by the next visit or the next time the panel is opened.
 */

import type { Db, ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { pushLinkStatsToMessmass } from '@/lib/messmassClient';
import { hasTrackedLinks, hitRowsForEvent } from './store';
import { sameTotals, totalsFromHitRows, type LinkStatTotals } from './totals';

export const SYNC_THROTTLE_MS = 30_000;

export type SyncResult = 'pushed' | 'unchanged' | 'throttled' | 'failed' | 'not_tracked' | 'not_linked';

export interface SyncDeps {
  push: (messmassEventId: string, totals: LinkStatTotals) => Promise<boolean>;
  now: () => Date;
}

const realDeps: SyncDeps = { push: pushLinkStatsToMessmass, now: () => new Date() };

type SyncedEvent = { _id: ObjectId; messmassEventId?: string | null };

export async function syncLinkStats(db: Db, event: SyncedEvent, options: { force?: boolean } = {}, deps: SyncDeps = realDeps): Promise<SyncResult> {
  if (!event.messmassEventId) return 'not_linked';
  const eventId = event._id.toString();
  if (!(await hasTrackedLinks(db, eventId))) return 'not_tracked';

  const events = db.collection(COLLECTIONS.EVENTS);
  const now = deps.now();
  const claimFilter = options.force
    ? { _id: event._id }
    : { _id: event._id, $or: [{ 'shortLinkSync.pushedAt': { $exists: false } }, { 'shortLinkSync.pushedAt': { $lt: new Date(now.getTime() - SYNC_THROTTLE_MS).toISOString() } }] };
  const before = await events.findOneAndUpdate(claimFilter, { $set: { 'shortLinkSync.pushedAt': now.toISOString() } }, { returnDocument: 'before', projection: { shortLinkSync: 1 } });
  if (!before) return 'throttled';

  const totals = totalsFromHitRows(await hitRowsForEvent(db, eventId));
  if (!options.force && sameTotals(before.shortLinkSync?.totals, totals)) return 'unchanged';
  if (!(await deps.push(event.messmassEventId, totals))) return 'failed';
  await events.updateOne({ _id: event._id }, { $set: { 'shortLinkSync.totals': totals } });
  return 'pushed';
}
