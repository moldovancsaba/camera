/**
 * Reading and saving the stadium background slot (issue 326, plan items 1, 9 and 10): the generic tagged picture slot (lib/slots/tagged-store.ts) with the tag `stadium-background`
 * (`lib/library/stadium-background.ts`) and the slot id `stadium`. The global default set is every active global stadium background; a partner chooses `Partner.slots.stadium`, an event
 * `Event.slots.stadium`; an event's own choice always wins; a value that is just "use the default" is not stored.
 */

import { STADIUM_BACKGROUND_TAG } from '@/lib/library/stadium-background';
import { STADIUM_SLOT } from './stadium';
import { taggedPictureStore, type PictureItemView, type PicturePanel } from './tagged-store';

const store = taggedPictureStore({ slot: STADIUM_SLOT, tag: STADIUM_BACKGROUND_TAG });

export type StadiumItemView = PictureItemView;
export type StadiumPanel = PicturePanel;

export const globalStadiumDocs = store.globalDocs;
export const globalStadiumIds = store.globalIds;
export const resolveEventStadiumDocs = store.resolveEventDocs;
export const setPartnerStadium = store.setPartner;
export const setEventStadium = store.setEvent;
export const addStadiumToPartnerSlot = store.addToPartnerSlot;
export const addStadiumToEventSlot = store.addToEventSlot;
export const loadPartnerStadiumPanel = store.loadPartnerPanel;
export const loadEventStadiumPanel = store.loadEventPanel;
export const listStadiumBackgrounds = store.listGlobal;
