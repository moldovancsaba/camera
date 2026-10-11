/**
 * The sample selfie as a slot (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md; owner answers 255 to 260, 2026-10-10): the picture in the photo window of the welcome page screen when the
 * event has no photo of its own to show. It is the generic tagged picture slot (lib/slots/picture-slot.ts: global default set, partner, event, one rule) with the slot id `selfie`; the
 * names below are the ones the sample selfie code always used. Pure; unit-tested (selfie.test.ts).
 */

import { pickPicture, pictureChain, resolvePartnerPictures, resolvePictures, type HasSlots } from './picture-slot';
import type { ResolvedItem, SlotLevel } from './resolve';

export const SELFIE_SLOT = 'selfie';

/** The levels of the chain, root first: the global default set, the partner, the event. */
export const selfieChain = (globalIds: readonly string[], partner: HasSlots | null | undefined, event: HasSlots | null | undefined): SlotLevel[] => pictureChain(SELFIE_SLOT, globalIds, partner, event);

/** The sample selfies an event uses: its own first, then what it takes from its partner, which takes from the global set. */
export const resolveSelfies = (globalIds: readonly string[], partner: HasSlots | null | undefined, event: HasSlots | null | undefined): ResolvedItem[] => resolvePictures(SELFIE_SLOT, globalIds, partner, event);

/** What a partner uses: the same chain without the event. */
export const resolvePartnerSelfies = (globalIds: readonly string[], partner: HasSlots | null | undefined): ResolvedItem[] => resolvePartnerPictures(SELFIE_SLOT, globalIds, partner);

/** The one sample selfie an event gets: the stored pick while it is among the items, else a random one; `again` for another (picture-slot.ts `pickPicture`). */
export const pickSelfie = pickPicture;
