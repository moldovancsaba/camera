/**
 * The state of the one-screen vetting review (issue 628, owner request 2026-10-12): one photo, its people, which person is selected, whether the reviewer said "nobody in this photo", and the
 * rules for when the photo can be approved or rejected. Pure and free of React and the browser, so the rules have tests (review-state.test.ts); the component only draws and calls these.
 *
 * The rules (owner answers 452 to 455): drawing a rectangle at any time makes a new person; a person is complete with a gender and an age; a photo is marked when it has people and each is
 * complete, or the reviewer said nobody is in it; **a photo cannot be approved or rejected before it is marked** (rejected photos are annotated too), and a rejection also needs at least one
 * reason. Gender and age are single choices, emotion is a single optional choice (tap again to clear), items are several. Only the options the event offers now can be chosen; what an older
 * list had is dropped when a saved photo is opened, so saving never fails on a key that was hidden since.
 */

import { GROUPS, isKnownKey, optionLabel, optionsOf, type ResolvedVocabulary } from './vocabulary';
import { MAX_PEOPLE, type PersonBox, type PersonTag } from './people';

/** A press-drag shorter than this (percent of the photo, on a side) is a tap or a sliver, not a rectangle. */
export const MIN_SIDE_PERCENT = 2;
/** The longest free-text note of a rejection (the review route cuts it here too). */
export const MAX_NOTE_LENGTH = 500;

export interface Point {
  x: number;
  y: number;
}

/** The groups that describe a person. Gender and age are required, emotion and items are optional. */
export type PersonGroup = 'gender' | 'age' | 'emotion' | 'merch';
export const PERSON_GROUPS: readonly PersonGroup[] = ['gender', 'age', 'emotion', 'merch'];

/** What the reviewer has done to the photo so far. A person without a gender or an age has an empty string for it: incomplete. */
export interface ReviewDraft {
  people: PersonTag[];
  selectedId: string | null;
  /** The reviewer said nobody is in the photo. Only possible while the list is empty. */
  nobody: boolean;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const round = (value: number) => Math.round(value * 100) / 100;

/** The rectangle between two points, in percent, kept inside the photo. */
export function boxBetween(a: Point, b: Point): PersonBox {
  const x = clamp(Math.min(a.x, b.x));
  const y = clamp(Math.min(a.y, b.y));
  return { x: round(x), y: round(y), w: round(clamp(Math.max(a.x, b.x)) - x), h: round(clamp(Math.max(a.y, b.y)) - y) };
}

/** Whether a drawn box is a rectangle (2 % or more on each side) and not a tap or a sliver. */
export const isRectangle = (box: PersonBox): boolean => box.w >= MIN_SIDE_PERCENT && box.h >= MIN_SIDE_PERCENT;

/** The person a tap landed on: of the rectangles that contain the point the smallest, and the later one when they are the same size. Null when the tap is on no rectangle. */
export function personAt(people: readonly PersonTag[], point: Point): string | null {
  let best: PersonTag | null = null;
  for (const person of people) {
    const { x, y, w, h } = person.box;
    if (point.x < x || point.x > x + w || point.y < y || point.y > y + h) continue;
    if (!best || w * h <= best.box.w * best.box.h) best = person;
  }
  return best ? best.id : null;
}

/** A new id for a person, unique inside one photo. */
export const newPersonId = (): string => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/**
 * The draft of a photo when it is opened: what was saved with it (a photo whose first call worked and whose decision did not comes back with its people), kept only as far as the event
 * offers the options now. A gender or age that is not offered any more is emptied (the person is incomplete again), an emotion or item that is not offered is dropped.
 */
export function startDraft(saved: { people: readonly PersonTag[]; peopleMarked: boolean }, vocabulary: ResolvedVocabulary): ReviewDraft {
  const offered = (group: PersonGroup, key: string | undefined) => (key !== undefined && isKnownKey(vocabulary, group, key, { activeOnly: true }) ? key : undefined);
  const people = saved.people.map((person): PersonTag => {
    const emotion = offered('emotion', person.emotion);
    const merch = (person.merch ?? []).filter((item) => offered('merch', item));
    return { id: person.id, box: person.box, gender: offered('gender', person.gender) ?? '', age: offered('age', person.age) ?? '', ...(emotion ? { emotion } : {}), ...(merch.length > 0 ? { merch } : {}) };
  });
  return { people, selectedId: null, nobody: saved.peopleMarked && people.length === 0 };
}

/**
 * A rectangle was drawn: a new person with it, selected, and nobody-in-the-photo cleared. A sliver (a side under 2 %) or the 41st person creates nothing: the draft comes back unchanged.
 */
export function addPerson(draft: ReviewDraft, box: PersonBox, id: string): ReviewDraft {
  if (!isRectangle(box) || draft.people.length >= MAX_PEOPLE) return draft;
  const taken = new Set(draft.people.map((person) => person.id));
  let unique = id;
  while (taken.has(unique)) unique += 'x';
  return { people: [...draft.people, { id: unique, box, gender: '', age: '' }], selectedId: unique, nobody: false };
}

export const selectPerson = (draft: ReviewDraft, id: string | null): ReviewDraft => (id === null || draft.people.some((person) => person.id === id) ? { ...draft, selectedId: id } : draft);

/** Takes a person away; nothing is selected afterwards (and the reviewer has to say nobody is in the photo again if that was the last one). */
export function removePerson(draft: ReviewDraft, id: string): ReviewDraft {
  if (!draft.people.some((person) => person.id === id)) return draft;
  return { people: draft.people.filter((person) => person.id !== id), selectedId: draft.selectedId === id ? null : draft.selectedId, nobody: false };
}

/** A person with its optional parts set as given: an empty emotion or an empty list of items is left out, so a saved person never carries an empty value. */
function withOptional(person: PersonTag, optional: { emotion?: string | undefined; merch?: string[] | undefined }): PersonTag {
  const emotion = 'emotion' in optional ? optional.emotion : person.emotion;
  const merch = 'merch' in optional ? optional.merch : person.merch;
  return { id: person.id, box: person.box, gender: person.gender, age: person.age, ...(emotion ? { emotion } : {}), ...(merch && merch.length > 0 ? { merch } : {}) };
}

/**
 * One tap on an option of a group for a person. Gender and age take the option (tapping the one chosen keeps it: they are required); emotion takes it, and tapping it again clears it; items
 * are toggled one by one. An option the event does not offer, or an unknown person, changes nothing.
 */
export function chooseOption(draft: ReviewDraft, id: string, group: PersonGroup, key: string, vocabulary: ResolvedVocabulary): ReviewDraft {
  if (!isKnownKey(vocabulary, group, key, { activeOnly: true })) return draft;
  if (!draft.people.some((person) => person.id === id)) return draft;
  const people = draft.people.map((person): PersonTag => {
    if (person.id !== id) return person;
    if (group === 'gender') return { ...person, gender: key };
    if (group === 'age') return { ...person, age: key };
    if (group === 'emotion') return withOptional(person, { emotion: person.emotion === key ? undefined : key });
    const merch = person.merch ?? [];
    return withOptional(person, { merch: merch.includes(key) ? merch.filter((item) => item !== key) : [...merch, key] });
  });
  return { ...draft, people };
}

/** "Nobody in this photo": only possible while the list is empty (a rectangle clears it). */
export const setNobody = (draft: ReviewDraft, nobody: boolean): ReviewDraft => (draft.people.length === 0 ? { ...draft, nobody } : draft);

/** A person is complete with a gender and an age the event offers now. */
export const isComplete = (person: PersonTag, vocabulary: ResolvedVocabulary): boolean =>
  isKnownKey(vocabulary, 'gender', person.gender, { activeOnly: true }) && isKnownKey(vocabulary, 'age', person.age, { activeOnly: true });

export const incompleteCount = (draft: ReviewDraft, vocabulary: ResolvedVocabulary): number => draft.people.filter((person) => !isComplete(person, vocabulary)).length;

/** The photo is marked: it has people and each is complete, or the reviewer said nobody is in it. */
export const isMarked = (draft: ReviewDraft, vocabulary: ResolvedVocabulary): boolean =>
  draft.people.length > 0 ? incompleteCount(draft, vocabulary) === 0 : draft.nobody;

/** The keys of the reject reasons the event offers now. */
export const offeredReasons = (vocabulary: ResolvedVocabulary): string[] => optionsOf(vocabulary, 'reject_reason').map((option) => option.key);

/** The chosen reasons that the event offers now, in the order of the list. */
export function chosenReasons(reasons: readonly string[], vocabulary: ResolvedVocabulary): string[] {
  const chosen = new Set(reasons);
  return offeredReasons(vocabulary).filter((key) => chosen.has(key));
}

/** One tap on a reason: it is chosen, or not chosen any more. */
export const toggleReason = (reasons: readonly string[], key: string): string[] => (reasons.includes(key) ? reasons.filter((item) => item !== key) : [...reasons, key]);

/** Whether the photo can be approved: marked (when the event asks for marking). */
export const canApprove = (draft: ReviewDraft, vocabulary: ResolvedVocabulary, markPeople: boolean): boolean => !markPeople || isMarked(draft, vocabulary);

/** Whether the rejection can be confirmed: marked as for an approval (rejected photos are annotated too) and at least one reason. */
export const canReject = (draft: ReviewDraft, vocabulary: ResolvedVocabulary, markPeople: boolean, reasons: readonly string[]): boolean =>
  canApprove(draft, vocabulary, markPeople) && chosenReasons(reasons, vocabulary).length > 0;

/** What is still missing before the photo can be approved, in words for the reviewer; null when nothing is. */
export function whatIsMissing(draft: ReviewDraft, vocabulary: ResolvedVocabulary, markPeople: boolean): string | null {
  if (!markPeople) return null;
  if (draft.people.length === 0) return draft.nobody ? null : 'Draw a rectangle around each person, or choose Nobody in this photo.';
  const missing = incompleteCount(draft, vocabulary);
  if (missing === 0) return null;
  return missing === 1 ? '1 person needs gender and age.' : `${missing} people need gender and age.`;
}

/** What a person is in words for the list: the chosen options, or what is missing. */
export function describePerson(person: PersonTag, vocabulary: ResolvedVocabulary): { text: string; complete: boolean } {
  const complete = isComplete(person, vocabulary);
  if (!complete) {
    const needsGender = !isKnownKey(vocabulary, 'gender', person.gender, { activeOnly: true });
    const needsAge = !isKnownKey(vocabulary, 'age', person.age, { activeOnly: true });
    const needs = needsGender && needsAge ? 'gender and age' : needsGender ? 'gender' : 'age';
    return { text: `needs ${needs}`, complete };
  }
  const parts = [optionLabel(vocabulary, 'gender', person.gender), optionLabel(vocabulary, 'age', person.age)];
  if (person.emotion) parts.push(optionLabel(vocabulary, 'emotion', person.emotion));
  for (const item of person.merch ?? []) parts.push(optionLabel(vocabulary, 'merch', item));
  return { text: parts.join(', '), complete };
}

/** The people as the save call takes them: nothing empty, every person with the keys chosen. Call it only when the draft is marked. */
export const peopleToSave = (draft: ReviewDraft): PersonTag[] => draft.people.map((person) => withOptional(person, {}));

/** The heading of a group: the question of the list (one place for the words, lib/photo-vetting/vocabulary.ts), with "optional" for the groups that are not required. */
export const groupHeading = (group: PersonGroup): string => `${GROUPS[group].question}${GROUPS[group].required ? '' : ' (optional)'}`;
