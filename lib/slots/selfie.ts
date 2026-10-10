/**
 * The sample selfie as a slot (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md; owner answers 255 to 260, 2026-10-10): the picture in the photo window of the welcome page screen when the
 * event has no photo of its own to show. It follows the one rule of docs/BUILDING_BRICKS.md section 4, with a **global level on top**: the global default is the set of the **active global
 * sample selfies** (a global admin switches one off to take it out); a partner with nothing stored follows that set, an event with nothing stored follows its partner. "Add more", "replace"
 * and "none" work as for the logo (`lib/slots/resolve.ts`). The slot id is `selfie` in `Partner.slots` and `Event.slots`. Nothing is copied into a child. Pure; unit-tested (selfie.test.ts).
 */

import { pickRandom, resolveSlot, type ResolvedItem, type SlotLevel, type SlotValue } from './resolve';

export const SELFIE_SLOT = 'selfie';

interface HasSlots {
  slots?: Record<string, SlotValue | undefined> | null;
}

/** The levels of the chain, root first: the global default set, the partner, the event. */
export function selfieChain(globalIds: readonly string[], partner: HasSlots | null | undefined, event: HasSlots | null | undefined): SlotLevel[] {
  return [
    { level: 'global', value: { items: [...globalIds] } },
    { level: 'partner', value: partner?.slots?.[SELFIE_SLOT] },
    { level: 'event', value: event?.slots?.[SELFIE_SLOT] },
  ];
}

/** The sample selfies an event uses: its own first, then what it takes from its partner, which takes from the global set. */
export function resolveSelfies(globalIds: readonly string[], partner: HasSlots | null | undefined, event: HasSlots | null | undefined): ResolvedItem[] {
  return resolveSlot(selfieChain(globalIds, partner, event)).items;
}

/** What a partner uses: the same chain without the event. */
export function resolvePartnerSelfies(globalIds: readonly string[], partner: HasSlots | null | undefined): ResolvedItem[] {
  return resolveSlot(selfieChain(globalIds, partner, null).slice(0, 2)).items;
}

/**
 * The one sample selfie an event gets (the earlier plan item 49: "pick one, once, and store the pick"). The stored pick stays while it is still among the items; otherwise a random one is
 * picked. `again` asks for another one (the editor's "Pick another"): a random one that is not the stored pick when there is a choice. Null when there is no item.
 */
export function pickSelfie(items: readonly ResolvedItem[], stored: string | null | undefined, options: { again?: boolean; random?: () => number } = {}): string | null {
  const ids = items.map((item) => item.id);
  if (ids.length === 0) return null;
  if (stored && ids.includes(stored) && !options.again) return stored;
  const others = options.again && stored && ids.length > 1 ? ids.filter((id) => id !== stored) : ids;
  return pickRandom(others, options.random);
}
