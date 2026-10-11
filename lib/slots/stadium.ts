/**
 * The stadium background as a slot (issue 326, plan item 1): the picture the stage of an event's default slideshow is drawn on, with the event's colours over it. The generic tagged picture slot
 * (lib/slots/picture-slot.ts) with the slot id `stadium`: the global default set is the active global stadium backgrounds, a partner follows it until it chooses its own, an event follows its
 * partner; an event's own choice always wins. With none, the built-in stage (the night-stadium background drawn by code in the event's colours) is used, as it always was. Pure; unit-tested (stadium.test.ts).
 */

import { pickPicture, pictureChain, resolvePartnerPictures, resolvePictures, type HasSlots } from './picture-slot';
import type { ResolvedItem, SlotLevel } from './resolve';

export const STADIUM_SLOT = 'stadium';

export const stadiumChain = (globalIds: readonly string[], partner: HasSlots | null | undefined, event: HasSlots | null | undefined): SlotLevel[] => pictureChain(STADIUM_SLOT, globalIds, partner, event);
export const resolveStadiums = (globalIds: readonly string[], partner: HasSlots | null | undefined, event: HasSlots | null | undefined): ResolvedItem[] => resolvePictures(STADIUM_SLOT, globalIds, partner, event);
export const resolvePartnerStadiums = (globalIds: readonly string[], partner: HasSlots | null | undefined): ResolvedItem[] => resolvePartnerPictures(STADIUM_SLOT, globalIds, partner);
export const pickStadium = pickPicture;
