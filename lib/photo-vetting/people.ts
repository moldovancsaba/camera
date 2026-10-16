/**
 * The people in a photo, marked during vetting or later on Photo analysis (issue 542, docs/PHOTO_VETTING_PLAN.md; owner request 2026-10-10): the reviewer draws a rectangle around each person and says who it is (a gender
 * and an age), how they look (an emotion, optional) and what they wear or hold (items, optional). The result is stored with the photo (`Submission.people`) and is what the analytics read:
 * people per photo, the mix of gender and age, emotions, items. A rectangle is in percent of the photo, so it is the same on any screen and on the picture after approval.
 *
 * **The words are a configurable list, not fixed buttons** (issue 628, lib/photo-vetting/vocabulary.ts): a person carries the **keys** of the options chosen (`female`, `adult`, `scarf`), and
 * what is a valid key is read from the list the event works with (the standard list under the general level, the partner and the event). A key that was hidden or deleted later still reads and
 * still counts. Pure and DOM-free; unit-tested (people.test.ts).
 */

import { GROUPS, STANDARD_VOCABULARY, isKnownKey, optionsOf, type ResolvedVocabulary } from './vocabulary';

export const MAX_PEOPLE = 40;
const MIN_SIDE = 1;

/** The colours of the rectangles, one for each person in turn: the design system's colour variables, never a literal. */
export const RECTANGLE_COLOURS: readonly string[] = [
  'var(--mantine-color-yellow-4)',
  'var(--mantine-color-blue-6)',
  'var(--mantine-color-green-6)',
  'var(--mantine-color-pink-6)',
  'var(--mantine-color-orange-6)',
  'var(--mantine-color-cyan-6)',
];

export interface PersonBox {
  /** Left and top, width and height, each in percent of the photo. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PersonTag {
  id: string;
  box: PersonBox;
  /** The keys of the options of the vocabulary (lib/photo-vetting/vocabulary.ts). */
  gender: string;
  age: string;
  emotion?: string;
  merch?: string[];
}

const round = (value: number) => Math.round(value * 100) / 100;

export type PeopleCheck = { ok: true; value: PersonTag[] } | { ok: false; reason: string };

/**
 * What a request may save as the people of a photo, or what a stored list must look like to be read: a list (empty is fine: nobody could be marked) of at most 40 people, each with a rectangle
 * inside the photo (in percent, at least 1% a side), one gender and one age, and optionally an emotion and items; every key must be in the vocabulary. **Saving** (`forSave`) accepts only the
 * options offered now; **reading** also accepts an option that was hidden or deleted since, so an old photo keeps its meaning. Anything else is refused. Ids are kept (or made from the position)
 * and rectangles are rounded to two decimals.
 */
export function parsePeople(input: unknown, vocabulary: ResolvedVocabulary = STANDARD_VOCABULARY, { forSave = false }: { forSave?: boolean } = {}): PeopleCheck {
  if (!Array.isArray(input)) return { ok: false, reason: 'people must be a list.' };
  if (input.length > MAX_PEOPLE) return { ok: false, reason: `At most ${MAX_PEOPLE} people can be marked in a photo.` };
  const known = (group: 'gender' | 'age' | 'emotion' | 'merch', key: unknown) => isKnownKey(vocabulary, group, key, { activeOnly: forSave });
  const value: PersonTag[] = [];
  for (const [index, raw] of input.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: `Person ${index + 1} is not an object.` };
    const { id, box, gender, age, emotion, merch, ...rest } = raw as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return { ok: false, reason: `Person ${index + 1} has an unknown field: ${Object.keys(rest)[0]}.` };
    const b = box as Record<string, unknown> | null;
    const numbers = b && typeof b === 'object' ? [b.x, b.y, b.w, b.h] : [];
    if (numbers.length !== 4 || numbers.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return { ok: false, reason: `Person ${index + 1} needs a rectangle (x, y, w, h in percent).` };
    const [x, y, w, h] = numbers as number[];
    if (x < 0 || y < 0 || w < MIN_SIDE || h < MIN_SIDE || x + w > 100.01 || y + h > 100.01) return { ok: false, reason: `The rectangle of person ${index + 1} is outside the photo or too small.` };
    if (!known('gender', gender) || !known('age', age)) return { ok: false, reason: `Person ${index + 1} needs one ${GROUPS.gender.label.toLowerCase()} and one ${GROUPS.age.label.toLowerCase()} from the list.` };
    if (emotion !== undefined && !known('emotion', emotion)) return { ok: false, reason: `Person ${index + 1} has an unknown emotion.` };
    if (merch !== undefined && (!Array.isArray(merch) || merch.some((item) => !known('merch', item)))) return { ok: false, reason: `Person ${index + 1} has unknown items.` };
    const merchList = [...new Set((merch as string[] | undefined) ?? [])];
    value.push({
      id: typeof id === 'string' && id.trim() && id.length <= 40 ? id.trim() : `p${index + 1}`,
      box: { x: round(x), y: round(y), w: round(Math.min(w, 100 - x)), h: round(Math.min(h, 100 - y)) },
      gender: gender as string,
      age: age as string,
      ...(emotion !== undefined ? { emotion: emotion as string } : {}),
      ...(merchList.length > 0 ? { merch: merchList } : {}),
    });
  }
  return { ok: true, value };
}

export interface PeopleSummary {
  /** Photos that were looked at (marked, even with nobody in them), and those with at least one person. */
  photos: number;
  photosWithPeople: number;
  people: number;
  peoplePerPhoto: number;
  /** Counts by the key of the option. Every option offered now is there (with 0 when nobody has it), and any other key that was used (hidden or deleted since) too. */
  byGender: Record<string, number>;
  byAge: Record<string, number>;
  /** Gender and age together, by `<gender>-<age>`. */
  byPerson: Record<string, number>;
  byEmotion: Record<string, number>;
  /** People with at least one item, and each item (a person can have several). */
  withMerch: number;
  byMerch: Record<string, number>;
}

const zero = (keys: readonly string[]): Record<string, number> => Object.fromEntries(keys.map((key) => [key, 0]));
const bump = (counts: Record<string, number>, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

/** Counts of what was marked, for the analytics: over any list of photos (documents with `people`, a missing field means not looked at). Pure. */
export function summarizePeople(photos: ReadonlyArray<{ people?: unknown } | null | undefined>, vocabulary: ResolvedVocabulary = STANDARD_VOCABULARY): PeopleSummary {
  const keys = (group: 'gender' | 'age' | 'emotion' | 'merch') => optionsOf(vocabulary, group).map((option) => option.key);
  const summary: PeopleSummary = {
    photos: 0,
    photosWithPeople: 0,
    people: 0,
    peoplePerPhoto: 0,
    byGender: zero(keys('gender')),
    byAge: zero(keys('age')),
    byPerson: zero(keys('gender').flatMap((gender) => keys('age').map((age) => `${gender}-${age}`))),
    byEmotion: zero(keys('emotion')),
    withMerch: 0,
    byMerch: zero(keys('merch')),
  };
  for (const photo of photos) {
    if (!photo || !Array.isArray(photo.people)) continue;
    const checked = parsePeople(photo.people, vocabulary);
    if (!checked.ok) continue;
    summary.photos += 1;
    if (checked.value.length > 0) summary.photosWithPeople += 1;
    for (const person of checked.value) {
      summary.people += 1;
      bump(summary.byGender, person.gender);
      bump(summary.byAge, person.age);
      bump(summary.byPerson, `${person.gender}-${person.age}`);
      if (person.emotion) bump(summary.byEmotion, person.emotion);
      if (person.merch && person.merch.length > 0) {
        summary.withMerch += 1;
        for (const item of person.merch) bump(summary.byMerch, item);
      }
    }
  }
  summary.peoplePerPhoto = summary.photos > 0 ? Math.round((summary.people / summary.photos) * 100) / 100 : 0;
  return summary;
}

/**
 * Whether the vetting of an event asks for the people to be marked: **on for every event unless it was switched off** (owner answer 264, "everywhere", 2026-10-10). A missing setting is on, so no
 * event has to be changed; a global admin can switch it off for an event (`Event.markPeopleInVetting: false`).
 */
export function markPeopleOn(event: { markPeopleInVetting?: unknown } | null | undefined): boolean {
  return event?.markPeopleInVetting !== false;
}
