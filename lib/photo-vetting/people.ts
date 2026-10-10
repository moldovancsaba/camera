/**
 * The people in a photo, marked at vetting (issue 542, docs/PHOTO_VETTING_PLAN.md; owner request 2026-10-10): the reviewer draws a rectangle around each person and taps the buttons that
 * say who it is (one of 8: female or male, kid, young, adult or old), how they look (one of 4 emotions) and any merchandise they wear (any of 4). The result is stored with the photo
 * (`Submission.people`) and is what the analytics read: people per photo, the mix of age and gender, emotions, merchandise. The 16 buttons and their emoji are one table (`PERSON_OPTIONS`,
 * `EMOTION_OPTIONS`, `MERCH_OPTIONS`): the screens, the check of what is saved and the counts all read it, so a change is made once. A rectangle is in percent of the photo, so it is the same
 * on any screen and on the picture after approval. Pure and DOM-free; unit-tested (people.test.ts).
 */

export const MAX_PEOPLE = 40;
const MIN_SIDE = 1;

export type Gender = 'female' | 'male';
export type Age = 'kid' | 'young' | 'adult' | 'old';
export type Emotion = 'sad' | 'unamused' | 'happy' | 'angry';
export type Merch = 'cap' | 'jersey' | 'flag' | 'other';

export interface PersonOption {
  id: string;
  gender: Gender;
  age: Age;
  emoji: string;
  label: string;
}

/** The first two rows of the grid: the women and girls, then the men and boys, each kid, young, adult, old. */
export const PERSON_OPTIONS: readonly PersonOption[] = [
  { id: 'female-kid', gender: 'female', age: 'kid', emoji: '👶', label: 'Female kid' },
  { id: 'female-young', gender: 'female', age: 'young', emoji: '👧', label: 'Female young' },
  { id: 'female-adult', gender: 'female', age: 'adult', emoji: '👩', label: 'Female adult' },
  { id: 'female-old', gender: 'female', age: 'old', emoji: '👵', label: 'Female old' },
  { id: 'male-kid', gender: 'male', age: 'kid', emoji: '👶', label: 'Male kid' },
  { id: 'male-young', gender: 'male', age: 'young', emoji: '👦', label: 'Male young' },
  { id: 'male-adult', gender: 'male', age: 'adult', emoji: '🧔', label: 'Male adult' },
  { id: 'male-old', gender: 'male', age: 'old', emoji: '👴', label: 'Male old' },
];

export const EMOTION_OPTIONS: ReadonlyArray<{ id: Emotion; emoji: string; label: string }> = [
  { id: 'sad', emoji: '☹️', label: 'Sad' },
  { id: 'unamused', emoji: '😒', label: 'Unamused' },
  { id: 'happy', emoji: '😃', label: 'Happy' },
  { id: 'angry', emoji: '🤬', label: 'Angry' },
];

/** Merchandise: any number of them on one person. */
export const MERCH_OPTIONS: ReadonlyArray<{ id: Merch; emoji: string; label: string }> = [
  { id: 'cap', emoji: '🧢', label: 'Cap' },
  { id: 'other', emoji: '🛍️', label: 'Other merchandise' },
  { id: 'jersey', emoji: '🎽', label: 'Jersey or shirt' },
  { id: 'flag', emoji: '🇭🇺', label: 'Flag' },
];

/** The colours of the rectangles, one for each person in turn (the first is yellow, the second blue, as in the reviewers' sketch): the design system's colour variables, never a literal. */
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
  gender: Gender;
  age: Age;
  emotion?: Emotion;
  merch?: Merch[];
}

const GENDERS: readonly string[] = ['female', 'male'];
const AGES: readonly string[] = ['kid', 'young', 'adult', 'old'];
const EMOTIONS: readonly string[] = EMOTION_OPTIONS.map((option) => option.id);
const MERCHANDISE: readonly string[] = MERCH_OPTIONS.map((option) => option.id);

const round = (value: number) => Math.round(value * 100) / 100;

/** The person option of a gender and an age, for the screens. */
export function personOption(gender: Gender, age: Age): PersonOption {
  return PERSON_OPTIONS.find((option) => option.gender === gender && option.age === age) ?? PERSON_OPTIONS[0];
}

export type PeopleCheck = { ok: true; value: PersonTag[] } | { ok: false; reason: string };

/**
 * What a request may save as the people of a photo: a list (empty is fine: nobody could be marked) of at most 40 people, each with a rectangle inside the photo (in percent, at least 1% a
 * side) and one of the 8 person options; an emotion and merchandise are optional and must be known. Anything else is refused. Ids are kept (or made from the position) and rectangles
 * are rounded to two decimals.
 */
export function parsePeople(input: unknown): PeopleCheck {
  if (!Array.isArray(input)) return { ok: false, reason: 'people must be a list.' };
  if (input.length > MAX_PEOPLE) return { ok: false, reason: `At most ${MAX_PEOPLE} people can be marked in a photo.` };
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
    if (typeof gender !== 'string' || !GENDERS.includes(gender) || typeof age !== 'string' || !AGES.includes(age)) return { ok: false, reason: `Person ${index + 1} needs one of the 8 person buttons (female or male, kid, young, adult or old).` };
    if (emotion !== undefined && (typeof emotion !== 'string' || !EMOTIONS.includes(emotion))) return { ok: false, reason: `Person ${index + 1} has an unknown emotion.` };
    if (merch !== undefined && (!Array.isArray(merch) || merch.some((item) => typeof item !== 'string' || !MERCHANDISE.includes(item)))) return { ok: false, reason: `Person ${index + 1} has unknown merchandise.` };
    const merchList = [...new Set((merch as string[] | undefined) ?? [])] as Merch[];
    value.push({
      id: typeof id === 'string' && id.trim() && id.length <= 40 ? id.trim() : `p${index + 1}`,
      box: { x: round(x), y: round(y), w: round(Math.min(w, 100 - x)), h: round(Math.min(h, 100 - y)) },
      gender: gender as Gender,
      age: age as Age,
      ...(emotion !== undefined ? { emotion: emotion as Emotion } : {}),
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
  byGender: Record<Gender, number>;
  byAge: Record<Age, number>;
  /** Gender and age together, by the id of the person button. */
  byPerson: Record<string, number>;
  byEmotion: Record<Emotion, number>;
  /** People with at least one merchandise, and each merchandise (a person can wear several). */
  withMerch: number;
  byMerch: Record<Merch, number>;
}

const zero = <K extends string>(keys: readonly K[]): Record<K, number> => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

/** Counts of what was marked, for the analytics: over any list of photos (documents with `people`, a missing field means not looked at). Pure. */
export function summarizePeople(photos: ReadonlyArray<{ people?: unknown } | null | undefined>): PeopleSummary {
  const summary: PeopleSummary = {
    photos: 0,
    photosWithPeople: 0,
    people: 0,
    peoplePerPhoto: 0,
    byGender: zero(['female', 'male']),
    byAge: zero(['kid', 'young', 'adult', 'old']),
    byPerson: zero(PERSON_OPTIONS.map((option) => option.id)),
    byEmotion: zero(['sad', 'unamused', 'happy', 'angry']),
    withMerch: 0,
    byMerch: zero(['cap', 'jersey', 'flag', 'other']),
  };
  for (const photo of photos) {
    if (!photo || !Array.isArray(photo.people)) continue;
    const checked = parsePeople(photo.people);
    if (!checked.ok) continue;
    summary.photos += 1;
    if (checked.value.length > 0) summary.photosWithPeople += 1;
    for (const person of checked.value) {
      summary.people += 1;
      summary.byGender[person.gender] += 1;
      summary.byAge[person.age] += 1;
      summary.byPerson[`${person.gender}-${person.age}`] += 1;
      if (person.emotion) summary.byEmotion[person.emotion] += 1;
      if (person.merch && person.merch.length > 0) {
        summary.withMerch += 1;
        for (const item of person.merch) summary.byMerch[item] += 1;
      }
    }
  }
  summary.peoplePerPhoto = summary.photos > 0 ? Math.round((summary.people / summary.photos) * 100) / 100 : 0;
  return summary;
}
