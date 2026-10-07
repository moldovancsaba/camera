/**
 * What happens after a visitor was sent on through a tracked short link or an event's own short URL (camera#320): the visit is counted when it was a
 * person (lib/short-links/device.ts), and the totals are pushed to messmass when the event has tracked links (throttled, lib/short-links/sync.ts).
 * Runs after the redirect has been sent, so it never slows the visitor down, and never throws: a counting problem must not cost anyone the page.
 */

import type { Db, ObjectId } from 'mongodb';
import { deviceFromUserAgent, isCountableVisit } from './device';
import { recordHit } from './store';
import { syncLinkStats } from './sync';
import type { LinkKind } from './totals';

export interface Visit {
  event: { _id: ObjectId; messmassEventId?: string | null };
  slug: string;
  kind: LinkKind;
  method: string;
  headers: { get(name: string): string | null };
}

export async function countVisit(db: Db, visit: Visit): Promise<'counted' | 'skipped' | 'failed'> {
  if (!isCountableVisit(visit.method, visit.headers)) return 'skipped';
  try {
    await recordHit(db, { slug: visit.slug, eventId: visit.event._id.toString(), kind: visit.kind, device: deviceFromUserAgent(visit.headers.get('user-agent')) });
  } catch (error) {
    console.error(`Short link ${visit.slug}: the visit could not be counted`, error);
    return 'failed';
  }
  await syncLinkStats(db, visit.event).catch((error: unknown) => console.error(`Short link ${visit.slug}: messmass was not told`, error));
  return 'counted';
}
