/**
 * Saves the slots of an event's generated frame (docs/FRAME_SLOTS_PLAN.md, issue 502). Throws a 400 for slots the editor may not save. Slots equal to the default frame are stored as
 * "no slots", so the event keeps drawing the default frame with the images it already has. The images are drawn afterwards by generateFrameVariants.
 */

import type { Db, Document } from 'mongodb';
import { apiBadRequest } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { FrameDesign } from './context';
import { isDefaultSlots, parseSlots, type FrameSlots } from './slots';
import { refreshFrameDesign, type RefreshDeps } from './sync';

/** A choice of picture belongs to a message text: it goes with the message when the message goes. */
export function withoutGoneMessages(slots: FrameSlots, messages: readonly string[]): FrameSlots {
  const picture: FrameSlots['picture'] = {};
  for (const [position, slot] of Object.entries(slots.picture) as Array<[keyof FrameSlots['picture'], NonNullable<FrameSlots['picture'][keyof FrameSlots['picture']]>]>) {
    if (!slot.byMessage) {
      picture[position] = slot;
      continue;
    }
    const kept = Object.fromEntries(Object.entries(slot.byMessage).filter(([message]) => messages.includes(message)));
    const { byMessage: _gone, ...rest } = slot;
    void _gone;
    picture[position] = Object.keys(kept).length > 0 ? { ...rest, byMessage: kept } : rest;
  }
  return { text: slots.text, picture };
}

export async function saveFrameSlots(db: Db, event: Document, input: { slots?: unknown; reset?: unknown }, deps?: RefreshDeps): Promise<FrameDesign> {
  const current: FrameDesign = (event.frameDesign as FrameDesign | undefined) ?? (await refreshFrameDesign(db, event, deps)).design;
  let slots: FrameSlots | undefined;
  if (input.reset !== true) {
    const checked = parseSlots(input.slots);
    if (!checked.ok) throw apiBadRequest(checked.error);
    slots = isDefaultSlots(checked.slots) ? undefined : withoutGoneMessages(checked.slots, current.messages);
  }
  const updatedAt = (deps?.now ?? (() => new Date().toISOString()))();
  const { slots: _previous, ...rest } = current;
  void _previous;
  const design: FrameDesign = { ...rest, updatedAt, ...(slots ? { slots } : {}) };
  await db.collection(COLLECTIONS.EVENTS).updateOne(
    { _id: event._id },
    slots ? { $set: { 'frameDesign.slots': slots, 'frameDesign.updatedAt': updatedAt, updatedAt } } : { $set: { 'frameDesign.updatedAt': updatedAt, updatedAt }, $unset: { 'frameDesign.slots': '' } }
  );
  return design;
}
