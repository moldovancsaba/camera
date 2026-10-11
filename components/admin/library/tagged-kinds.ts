/**
 * The kinds of library picture that have their own pages, slot and panel (the sample selfie, issue 540; the stadium background, issue 326): what each is called, where its routes are, and the words
 * of its pages. One description for the global page (`TaggedImagesLibrary`) and the partner's and event's panel (`TaggedSlotPanel`), so a kind is added here and nowhere else in the pages.
 */

export type TaggedKind = 'selfie' | 'stadium';

export interface TaggedKindInfo {
  /** Singular and plural, lower case, for sentences. */
  noun: string;
  plural: string;
  /** Capitalised plural, for headings. */
  title: string;
  /** The folder of the partner and event routes: `/api/partners/<id>/<slotPath>`, `/api/events/<id>/<slotPath>`. */
  slotPath: string;
  /** The global list and upload route. */
  globalEndpoint: string;
  /** The panel's description at the partner and event levels. */
  panelDescription: { partner: string; event: string };
  /** The global page: its description, the line under the list, the empty state, the upload hint and a name example. */
  pageDescription: string;
  listNote: string;
  emptyText: string;
  uploadHint: string;
  namePlaceholder: string;
}

export const TAGGED_KINDS: Record<TaggedKind, TaggedKindInfo> = {
  selfie: {
    noun: 'sample selfie',
    plural: 'sample selfies',
    title: 'Sample selfies',
    slotPath: 'selfie-slot',
    globalEndpoint: '/api/sample-selfies',
    panelDescription: {
      partner: 'The picture in the photo window of the welcome page screen when an event has no photo of its own to show. Until you choose or upload your own, your events use the general sample selfies.',
      event: 'The picture in the photo window of the welcome page screen. Until you choose or upload your own, this event uses its partner’s sample selfies. One of them is picked for the screen.',
    },
    pageDescription:
      'The general selfies that fill the photo window of the welcome page screen. The active ones are the default of every partner until it chooses or uploads its own; an event follows its partner and gets one of them at random.',
    listNote: 'A sample selfie switched off is no longer used anywhere. With none active, the welcome page screen shows the drawn stand-in, as before.',
    emptyText: 'No sample selfies yet. Upload the first one below; until then every welcome page screen shows the stand-in.',
    uploadHint: 'Only images cleared for commercial use. A portrait or a square picture of one person works best; the event’s frame is drawn over it.',
    namePlaceholder: 'e.g. Fan with a scarf',
  },
  stadium: {
    noun: 'stadium background',
    plural: 'stadium backgrounds',
    title: 'Stadium backgrounds',
    slotPath: 'stadium-slot',
    globalEndpoint: '/api/stadium-backgrounds',
    panelDescription: {
      partner: 'The picture the stage of the default slideshow is drawn on, with the event’s colours over it. Until you choose or upload your own, your events use the general stadium backgrounds.',
      event: 'The picture the stage of the default slideshow is drawn on, with the event’s colours over it. Until you choose or upload your own, this event uses its partner’s stadium backgrounds. One of them is picked for the stage.',
    },
    pageDescription:
      'The general pictures the stage of an event’s default slideshow is drawn on, with the event’s colours over them. The active ones are the default of every partner until it chooses or uploads its own; an event follows its partner and gets one of them at random, once, when its default slideshow is made.',
    listNote: 'A stadium background switched off is no longer used for a new stage. With none active, the stage is drawn by code in the event’s colours, as before. A stage that is already drawn keeps its picture until an editor draws it again.',
    emptyText: 'No stadium backgrounds yet. Upload the first one below; until then every stage is the one drawn by code in the event’s colours.',
    uploadHint: 'Only images cleared for commercial use. A wide picture of a stadium works best (it fills a 16:9 stage, cropped); the event’s colours lie over it and the panels and the photo window are drawn on top.',
    namePlaceholder: 'e.g. Night match, floodlights',
  },
};
