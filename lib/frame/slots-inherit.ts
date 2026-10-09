/**
 * Where the slots of an event's generated frame come from (docs/FRAME_SLOTS_PLAN.md segment 5, owner answer 220; the rule of docs/BUILDING_BRICKS.md section 4): the event's own, else the
 * partner's default, else the general default, else the built-in default frame. Following means no copy: an event stores only the slots an editor set, a change of a default is read at
 * once by every event that follows and never touches an event's own slots. The images of the events that follow are redrawn by the admin after a default changes (`followersOf`).
 * Server side; unit-tested with a fake database.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { DEFAULT_SLOTS, parseSlots, type FrameSlots } from './slots';

export type SlotsSource = 'event' | 'partner' | 'global' | 'built-in';

const GLOBAL_SETTING = 'frame-slots-default';

/** Slots as stored on a partner or in the settings: checked again on the way out, so a malformed document is the same as none. */
function stored(value: unknown): FrameSlots | undefined {
  if (value === undefined || value === null) return undefined;
  const checked = parseSlots(value);
  return checked.ok ? checked.slots : undefined;
}

export async function getGlobalSlots(db: Db): Promise<FrameSlots | undefined> {
  const setting = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: GLOBAL_SETTING });
  return stored(setting?.slots);
}

export async function saveGlobalSlots(db: Db, slots: FrameSlots | undefined, updatedBy: string | null, now: string): Promise<void> {
  await db
    .collection(COLLECTIONS.ADMIN_SETTINGS)
    .updateOne({ settingId: GLOBAL_SETTING }, slots ? { $set: { settingId: GLOBAL_SETTING, slots, updatedAt: now, updatedBy } } : { $set: { settingId: GLOBAL_SETTING, updatedAt: now, updatedBy }, $unset: { slots: '' } }, { upsert: true });
}

export const partnerSlotsOf = (partner: Document | null | undefined): FrameSlots | undefined => stored(partner?.defaultFrameSlots);

export async function savePartnerSlots(db: Db, partnerId: string, slots: FrameSlots | undefined, now: string): Promise<boolean> {
  const result = await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId }, slots ? { $set: { defaultFrameSlots: slots, updatedAt: now } } : { $set: { updatedAt: now }, $unset: { defaultFrameSlots: '' } });
  return result.matchedCount > 0;
}

export interface InheritedSlots {
  /** What the event follows when it has none of its own; undefined is the built-in default frame. */
  slots: FrameSlots | undefined;
  source: Exclude<SlotsSource, 'event'>;
}

/** The slots an event follows: its partner's default, else the general default, else the built-in default frame (`slots` undefined). Two reads. */
export async function loadInheritedSlots(db: Db, event: Document, partner?: Document | null): Promise<InheritedSlots> {
  const partnerDoc = partner === undefined ? (typeof event.partnerId === 'string' && event.partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId }) : null) : partner;
  const fromPartner = partnerSlotsOf(partnerDoc);
  if (fromPartner) return { slots: fromPartner, source: 'partner' };
  const fromGlobal = await getGlobalSlots(db);
  return fromGlobal ? { slots: fromGlobal, source: 'global' } : { slots: undefined, source: 'built-in' };
}

/** The slots that draw the event's frame, and the level they come from. */
export async function effectiveSlots(db: Db, event: Document): Promise<{ slots: FrameSlots | undefined; source: SlotsSource }> {
  const own = stored((event.frameDesign as { slots?: unknown } | undefined)?.slots);
  if (own) return { slots: own, source: 'event' };
  return loadInheritedSlots(db, event);
}

/** What the slots mean as a frame: the slots themselves, or the default frame's four slots when there are none. */
export const slotsOrDefault = (slots: FrameSlots | undefined): FrameSlots => slots ?? DEFAULT_SLOTS;

export interface Follower {
  /** The Mongo _id of the event, as the admin routes take it. */
  id: string;
  eventId: string;
  name: string;
}

/**
 * The events whose drawn images depend on a default: those that have generated images and no slots of their own and, for the general default, whose partner has no default of its own.
 * An event that has no images yet needs nothing redrawn: it reads the default when its images are first drawn.
 */
export async function followersOf(db: Db, scope: { partnerId: string } | 'global'): Promise<Follower[]> {
  const filter: Document = { 'frameDesign.variants.0': { $exists: true }, 'frameDesign.slots': { $exists: false } };
  if (scope === 'global') {
    const own = await db.collection(COLLECTIONS.PARTNERS).find({ defaultFrameSlots: { $exists: true } }).project({ partnerId: 1 }).toArray();
    const excluded = own.map((partner) => partner.partnerId).filter((id): id is string => typeof id === 'string');
    if (excluded.length > 0) filter.partnerId = { $nin: excluded };
  } else {
    filter.partnerId = scope.partnerId;
  }
  const events = await db.collection(COLLECTIONS.EVENTS).find(filter).project({ eventId: 1, name: 1 }).sort({ updatedAt: -1 }).toArray();
  return events.map((event) => ({ id: String(event._id), eventId: String(event.eventId ?? ''), name: String(event.name ?? '') }));
}
