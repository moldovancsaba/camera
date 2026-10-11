/**
 * Reading and saving the sample selfie slot (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): the generic tagged picture slot (lib/slots/tagged-store.ts) with the tag `sample-selfie`
 * (`lib/library/sample-selfie.ts`) and the slot id `selfie`. The names below are the ones the sample selfie code always used.
 *
 * - The sample selfies are library images with the tag. The **global default set** is every active global one.
 * - A partner chooses `Partner.slots.selfie`: global sample selfies (straight from the global list, nothing is added to its Images library) or its own tagged uploads.
 * - An event chooses `Event.slots.selfie`: what its partner uses or its partner's own uploads (one way only, camera#361), or its own tagged uploads.
 * - A value that is just "use the default" is not stored: a child that stored nothing follows.
 */

import { SAMPLE_SELFIE_TAG } from '@/lib/library/sample-selfie';
import { SELFIE_SLOT } from './selfie';
import { taggedPictureStore, type PictureItemView, type PicturePanel } from './tagged-store';

const store = taggedPictureStore({ slot: SELFIE_SLOT, tag: SAMPLE_SELFIE_TAG });

export type SelfieItemView = PictureItemView;
export type SelfiePanel = PicturePanel;

export const globalSelfieDocs = store.globalDocs;
export const globalSelfieIds = store.globalIds;
export const resolveEventSelfieDocs = store.resolveEventDocs;
export const setPartnerSelfie = store.setPartner;
export const setEventSelfie = store.setEvent;
export const addSelfieToPartnerSlot = store.addToPartnerSlot;
export const addSelfieToEventSlot = store.addToEventSlot;
export const loadPartnerSelfiePanel = store.loadPartnerPanel;
export const loadEventSelfiePanel = store.loadEventPanel;
export const listSampleSelfies = store.listGlobal;
