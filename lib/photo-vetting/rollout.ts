/**
 * Rollout of photo vetting to the events that already exist (camera#271, docs/PHOTO_VETTING_PLAN.md). The owner decided that every
 * event requires vetting. A dry run reads the events and their recent photo activity and writes nothing; the run turns the setting
 * on for every event that does not have it, and can be repeated (events that are already on are skipped). Events that took photos
 * recently are listed, because from the moment the run finishes their next photos wait for approval.
 *
 * Photos made before vetting are not touched: a missing review status already counts as approved (lib/submissions/visibility.ts), and
 * no `approvedAt` is written, so the fanmass feed does not re-send them.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RolloutEventRow {
  id: string;
  name: string;
  partnerName: string | null;
  photosLast24h: number;
  photosLast7d: number;
  lastPhotoAt: string | null;
}

export interface RolloutReport {
  totalEvents: number;
  alreadyOn: number;
  toTurnOn: number;
  /** Events that would be switched on and took a photo in the last 24 hours, busiest first. */
  busyNow: RolloutEventRow[];
  /** Events that would be switched on and took a photo in the last 7 days (including the busy ones). */
  activeThisWeek: number;
  generatedAt: string;
}

export interface RolloutResult {
  turnedOn: number;
  alreadyOn: number;
  totalEvents: number;
}

const OFF = { 'photoVetting.required': { $ne: true } };

export async function rolloutDryRun(db: Db, now: Date = new Date()): Promise<RolloutReport> {
  const events = db.collection(COLLECTIONS.EVENTS);
  const [totalEvents, toTurnOn] = await Promise.all([events.countDocuments({}), events.countDocuments(OFF)]);

  const since7d = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const since24h = new Date(now.getTime() - DAY_MS).toISOString();
  const activity = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .aggregate<{ _id: string; photosLast24h: number; photosLast7d: number; lastPhotoAt: string }>([
      { $match: { createdAt: { $gte: since7d }, submissionKind: { $ne: 'tryon_result' }, eventId: { $type: 'string' } } },
      { $group: { _id: '$eventId', photosLast24h: { $sum: { $cond: [{ $gte: ['$createdAt', since24h] }, 1, 0] } }, photosLast7d: { $sum: 1 }, lastPhotoAt: { $max: '$createdAt' } } },
    ])
    .toArray();

  const offEvents = await events.find(OFF, { projection: { eventId: 1, name: 1, partnerName: 1 } }).toArray();
  const byUuid = new Map(activity.map((row) => [row._id, row]));
  const rows: RolloutEventRow[] = [];
  for (const event of offEvents) {
    const found = typeof event.eventId === 'string' ? byUuid.get(event.eventId) : undefined;
    if (!found) continue;
    rows.push({
      id: String(event._id),
      name: typeof event.name === 'string' ? event.name : String(event._id),
      partnerName: typeof event.partnerName === 'string' ? event.partnerName : null,
      photosLast24h: found.photosLast24h,
      photosLast7d: found.photosLast7d,
      lastPhotoAt: found.lastPhotoAt,
    });
  }
  return {
    totalEvents,
    alreadyOn: totalEvents - toTurnOn,
    toTurnOn,
    busyNow: rows.filter((row) => row.photosLast24h > 0).sort((a, b) => b.photosLast24h - a.photosLast24h || b.photosLast7d - a.photosLast7d).slice(0, 50),
    activeThisWeek: rows.length,
    generatedAt: now.toISOString(),
  };
}

export async function runRollout(db: Db, actorEmail: string | null, now: Date = new Date()): Promise<RolloutResult> {
  const events = db.collection(COLLECTIONS.EVENTS);
  const at = now.toISOString();
  const result = await events.updateMany(OFF, { $set: { photoVetting: { required: true, updatedAt: at, updatedBy: actorEmail ? `rollout: ${actorEmail}` : 'rollout' } } });
  const totalEvents = await events.countDocuments({});
  const toTurnOn = await events.countDocuments(OFF);
  return { turnedOn: result.modifiedCount, alreadyOn: totalEvents - toTurnOn, totalEvents };
}
