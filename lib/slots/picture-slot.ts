/**
 * A tagged library picture as a slot with a global level (issue 540 for the sample selfie, issue 326 for the stadium background; docs/BUILDING_BRICKS.md section 4): the picture a place of use gets
 * when it has none of its own. It follows the one rule of the slots, with the **global level on top**: the global default is the set of the **active global pictures with the tag** (a global admin
 * switches one off to take it out); a partner with nothing stored follows that set, an event with nothing stored follows its partner. "Add more", "replace" and "none" work as for the logo
 * (`lib/slots/resolve.ts`). The slot id (`selfie`, `stadium`) names the entry in `Partner.slots` and `Event.slots`. Nothing is copied into a child. Pure; unit-tested (selfie.test.ts, stadium.test.ts).
 */

import { pickRandom, resolveSlot, type ResolvedItem, type SlotLevel, type SlotValue } from './resolve';

export interface HasSlots {
  slots?: Record<string, SlotValue | undefined> | null;
}

/** The levels of the chain, root first: the global default set, the partner, the event. */
export function pictureChain(slot: string, globalIds: readonly string[], partner: HasSlots | null | undefined, event: HasSlots | null | undefined): SlotLevel[] {
  return [
    { level: 'global', value: { items: [...globalIds] } },
    { level: 'partner', value: partner?.slots?.[slot] },
    { level: 'event', value: event?.slots?.[slot] },
  ];
}

/** The pictures an event uses: its own first, then what it takes from its partner, which takes from the global set. */
export function resolvePictures(slot: string, globalIds: readonly string[], partner: HasSlots | null | undefined, event: HasSlots | null | undefined): ResolvedItem[] {
  return resolveSlot(pictureChain(slot, globalIds, partner, event)).items;
}

/** What a partner uses: the same chain without the event. */
export function resolvePartnerPictures(slot: string, globalIds: readonly string[], partner: HasSlots | null | undefined): ResolvedItem[] {
  return resolveSlot(pictureChain(slot, globalIds, partner, null).slice(0, 2)).items;
}

/**
 * The one picture an event gets (the earlier plan item 49: "pick one, once, and store the pick"). The stored pick stays while it is still among the items; otherwise a random one is
 * picked. `again` asks for another one (the editor's "Pick another"): a random one that is not the stored pick when there is a choice. Null when there is no item.
 */
export function pickPicture(items: readonly ResolvedItem[], stored: string | null | undefined, options: { again?: boolean; random?: () => number } = {}): string | null {
  const ids = items.map((item) => item.id);
  if (ids.length === 0) return null;
  if (stored && ids.includes(stored) && !options.again) return stored;
  const others = options.again && stored && ids.length > 1 ? ids.filter((id) => id !== stored) : ids;
  return pickRandom(others, options.random);
}
