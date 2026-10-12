/**
 * The counters for messmass (issue 521, phase 1, and issue 628; docs/ANALYTICS_AUDIT.md section 7.6, owner decisions 245 and the request of 2026-10-12): the list of numbers that go to messmass, and the
 * pure functions that make them from the report of lib/analytics/report.ts. **Counters only, never a person**: no name, e-mail, reviewer or photo leaves camera, only totals (decision 241).
 *
 * **Every name starts with `camera_`** (lower case snake case, `COUNTER_NAME_PATTERN`): messmass already holds variables of other sources (female, male, jersey, approvedImages, ...), and camera's
 * names must never meet them. The key of a definition is the messmass name.
 *
 * Where the numbers come from: the photos (taken, approved, declined, plays, vetting time, consents); the journey recording (seven more, **once the event has any journey record**); and what the
 * vetting person marked: the people in each photo (gender, age, emotion, items, in the words of the event's vocabulary, lib/photo-vetting/vocabulary.ts) and why a photo was declined. A counter
 * that cannot be counted is **never sent as a zero** (a zero would say "nobody" when the truth is "nobody counted"): an event with no journey record sends no journey counter, an event where no photo
 * is marked sends no annotation counter, and an event with no declined photo sends no reason counter. **Nothing waits any more**: the list below is everything the data can give.
 *
 * What a counter is, so it can be checked against messmass: a **total** is a whole running total for the event (every photo ever counted, never a day's change), so a repeat of the same push changes
 * nothing; an **average** is not additive and is sent as a whole value that messmass must store as it is, with no baseline. Each name has a readable label ("Camera: gender, Female"). The visits of
 * the tracked links already go to messmass through their own channel (lib/short-links/sync.ts) and are not part of this list. Pure and DOM-free; unit-tested in counters.test.ts.
 */

import { isRecorded, type JourneySummary } from './journey';
import { cleanCounterPayload, type CounterPayload } from './counters-contract';
import type { EventReport } from './report';
import { counterKey, optionLabel, optionsOf, type ResolvedVocabulary, type VocabGroup } from '@/lib/photo-vetting/vocabulary';

export type CounterKind = 'total' | 'average';

/** Where a counter comes from, for the preview. */
export type CounterSource = 'photos' | 'journey' | 'annotations' | 'reasons';

export interface CounterDefinition {
  /** The name in messmass: `camera_` and lower case snake case, the same string as the key in `projects.stats` and in the variable catalog (docs/ANALYTICS_AUDIT.md section 6). */
  key: string;
  /** The readable label that goes with the name (at most 80 characters). */
  label: string;
  kind: CounterKind;
  source: CounterSource;
  /** What it counts, in words. */
  definition: string;
}

const total = (key: string, source: CounterSource, label: string, definition: string): CounterDefinition => ({ key, label, kind: 'total', source, definition });
const average = (key: string, source: CounterSource, label: string, definition: string): CounterDefinition => ({ key, label, kind: 'average', source, definition });

/** The counters the existing data can give, in the order the preview shows them. The ones made from the vocabulary are the families below. */
export const COMPUTABLE_COUNTERS: readonly CounterDefinition[] = [
  total('camera_images_taken', 'photos', 'Camera: images taken', 'Photos taken or uploaded by users: originals, not removed from the event, picture not gone. Photos an editor added are not counted.'),
  total('camera_images_approved', 'photos', 'Camera: images approved', 'Of those, the photos that are approved now.'),
  total('camera_images_rejected', 'photos', 'Camera: images rejected', 'Of those, the photos that are declined now.'),
  total('camera_images_shown_on_slideshow', 'photos', 'Camera: images shown on the slideshow', 'Plays: how many times a photo of the event appeared on a giant screen, all slideshows, counted from the running play count of each photo.'),
  average('camera_avg_vetting_seconds', 'photos', 'Camera: average vetting time (seconds)', 'Average time from the photo being handed in to its first decision, over the photos that have one. Not sent until a photo was decided.'),
  total('camera_consents_accepted', 'photos', 'Camera: consents accepted', 'Photos whose user accepted at least one consent (the consent is stored on the photo; only acceptances exist).'),
  // From the journey recording: counted from the day the recording started, and not sent at all for an event that has no journey record (never a zero).
  total('camera_journey_opens', 'journey', 'Camera: journey opens', 'Visits to the capture page (a page load with the event; a return from a sign-in is not another visit), since the recording started. Not a count of different people.'),
  total('camera_journeys_completed', 'journey', 'Camera: journeys completed', 'Visits that saved a photo (the first photo of the visit), since the recording started.'),
  total('camera_permission_denied', 'journey', 'Camera: camera permission denied', 'Times a user said no when the live camera of a desktop asked for permission. A phone takes the photo with its own camera app and asks nothing on the page.'),
  total('camera_retakes', 'journey', 'Camera: retakes', 'Times a user went back from the move-and-zoom step to take the photo again.'),
  total('camera_consents_abandoned', 'journey', 'Camera: consents abandoned', 'Visits that were shown the consent and did not accept it (shown minus accepted, for the consent page and for the box on the Who-are-you page).'),
  total('camera_shares', 'journey', 'Camera: shares', 'Presses of a share button (copy the link, Facebook, X, LinkedIn, WhatsApp) on the page after the photo was saved.'),
  total('camera_downloads', 'journey', 'Camera: downloads', 'Downloads of the photo from its public page.'),
  // From what the vetting person marked: sent once at least one photo is marked, over every marked photo of the event (approved, declined or still waiting).
  total('camera_images_annotated', 'annotations', 'Camera: images annotated', 'Photos a reviewer looked at and marked (even when nobody is in them): the coverage of every counter about the people.'),
  total('camera_images_with_people', 'annotations', 'Camera: images with people', 'Of those, the photos with at least one person marked.'),
  total('camera_images_no_people', 'annotations', 'Camera: images with no people', 'Of those, the photos the reviewer marked as having nobody in them.'),
  total('camera_images_one_person', 'annotations', 'Camera: images with one person', 'Of those, the photos with exactly one person.'),
  total('camera_images_group', 'annotations', 'Camera: images with a group', 'Of those, the photos with two or more people.'),
  total('camera_people_total', 'annotations', 'Camera: people marked', 'People marked in all the annotated photos together.'),
  total('camera_people_with_merch', 'annotations', 'Camera: people with merchandise', 'People with at least one item (a scarf, a jersey, ...).'),
  average('camera_avg_people_per_image', 'annotations', 'Camera: average people per image', 'People per annotated photo, two decimals. An average: messmass stores it as it is.'),
  // Why photos were declined: sent once the event has a declined photo.
  total('camera_images_rejected_no_reason', 'reasons', 'Camera: images rejected with no reason', 'Declined photos that carry no reason from the list (declined before the reasons existed).'),
];

/** The counters made from a list of the vocabulary: one for each option, named from its key. */
export interface CounterFamily {
  group: VocabGroup;
  /** `camera_gender_`: what every name of the family starts with. */
  prefix: string;
  source: CounterSource;
  /** The name of the placeholder row while the family has no counter yet. */
  placeholder: string;
  definition: string;
  /** The word in the label ("Camera: gender, Female"); the same word as in the name. */
  word: string;
}

/** The word of a group in a counter's name and label: gender, age, emotion, merch, rejected. */
const wordOf = (group: VocabGroup): string => counterKey(group, '').slice('camera_'.length, -1);

const family = (group: VocabGroup, definition: string): CounterFamily => ({ group, prefix: counterKey(group, ''), source: group === 'reject_reason' ? 'reasons' : 'annotations', placeholder: `${counterKey(group, '')}<option>`, definition, word: wordOf(group) });

export const COUNTER_FAMILIES: readonly CounterFamily[] = [
  family('gender', 'People marked with this gender, over all annotated photos. One counter for every option offered now (0 when nobody has it) and for every other key found in the data.'),
  family('age', 'People marked with this age, over all annotated photos. One counter for every option offered now (0 when nobody has it) and for every other key found in the data.'),
  family('emotion', 'People marked with this emotion, over all annotated photos. One counter for every option offered now (0 when nobody has it) and for every other key found in the data.'),
  family('merch', 'People marked with this item, over all annotated photos (a person with two items is in two counters). One counter for every option offered now (0 when nobody has it) and for every other key found in the data.'),
  family('reject_reason', 'Declined photos that carry this reason (a photo with several reasons is in each). One counter for every reason offered now (0 when none) and for every other key found in the data.'),
];

/** The lists that describe a person in a photo; the reasons describe the photo. */
const PERSON_GROUPS = ['gender', 'age', 'emotion', 'merch'] as const;

export interface WaitingCounter {
  key: string;
  label: string;
  why: string;
  waitsFor: string;
}

/** The counters of the audit's list that cannot be computed yet, and what each waits for. None: the decline reasons that waited for the fixed list are counted from it now (issue 628). */
export const WAITING_COUNTERS: readonly WaitingCounter[] = [];

/** The numbers to send: totals and averages by messmass name, and the label of each name. Only counters that have a value are in it. */
export type CounterSet = CounterPayload;

export const NO_COUNTERS: CounterSet = { totals: {}, averages: {}, labels: {} };

const whole = (value: number): number => Math.max(0, Math.round(value));
const DEFINITIONS = new Map(COMPUTABLE_COUNTERS.map((counter) => [counter.key, counter]));

/**
 * The keys of a list to send a counter for: every option offered now (0 when nobody has it) and every other key seen in the data (hidden or deleted since), in the order of the list, then the keys
 * the list does not know. An option that was hidden and nobody has is not sent.
 */
function keysFor(vocabulary: ResolvedVocabulary, group: VocabGroup, counts: Record<string, number>): string[] {
  const known = optionsOf(vocabulary, group, { activeOnly: false });
  const offered = new Set(optionsOf(vocabulary, group).map((option) => option.key));
  const inList = known.map((option) => option.key).filter((key) => offered.has(key) || (counts[key] ?? 0) > 0);
  const listed = new Set(known.map((option) => option.key));
  return [...inList, ...Object.keys(counts).filter((key) => !listed.has(key) && counts[key] > 0).sort()];
}

/** The label of a counter made from an option: "Camera: gender, Female", "Camera: rejected, Nudity or sexual content". */
const optionCounterLabel = (vocabulary: ResolvedVocabulary, group: VocabGroup, key: string): string => `Camera: ${wordOf(group)}, ${optionLabel(vocabulary, group, key)}`;

/**
 * The counters of an event from its report, and from its journey summary when it has one. The report and the summary must cover the whole event (no range of days): a counter is a running
 * total. A summary of an event with no journey record (`isRecorded` false) adds nothing: the journey counters are left out, not sent as zeros. The vocabulary (the report's own when none is
 * given) decides which options get a counter. The set is run through the contract of counters-contract.ts last, so a name that does not match the pattern is dropped and logged.
 */
export function buildCounters(report: EventReport, journey?: JourneySummary | null, vocabulary: ResolvedVocabulary = report.vocabulary): CounterSet {
  const totals: Record<string, number> = {};
  const averages: Record<string, number> = {};
  const labels: Record<string, string> = {};
  const put = (key: string, value: number) => {
    const definition = DEFINITIONS.get(key);
    if (!definition) throw new Error(`Unknown counter ${key}`);
    (definition.kind === 'total' ? totals : averages)[key] = definition.kind === 'total' ? whole(value) : value;
    labels[key] = definition.label;
  };
  // One counter of a family: named from the key of the option, labelled with its words.
  const putOption = (group: VocabGroup, key: string, value: number) => {
    totals[counterKey(group, key)] = whole(value);
    labels[counterKey(group, key)] = optionCounterLabel(vocabulary, group, key);
  };

  put('camera_images_taken', report.photos.taken);
  put('camera_images_approved', report.photos.approved);
  put('camera_images_rejected', report.photos.rejected);
  put('camera_images_shown_on_slideshow', report.screens.plays);
  put('camera_consents_accepted', report.consents.photosWithConsent);
  if (isRecorded(journey)) {
    put('camera_journey_opens', journey.opens);
    put('camera_journeys_completed', journey.completed);
    put('camera_permission_denied', journey.camera.denied);
    put('camera_retakes', journey.photos.retakes);
    put('camera_consents_abandoned', journey.consent.abandoned);
    put('camera_shares', journey.shares.clicks);
    put('camera_downloads', journey.shares.downloads);
  }
  if (report.vetting.timeToFirstDecision.avgSeconds !== null) put('camera_avg_vetting_seconds', whole(report.vetting.timeToFirstDecision.avgSeconds));

  // What the vetting person marked: nothing at all until a photo is marked (a zero would say nobody, when nobody was counted).
  const { summary } = report.people;
  if (summary.photos > 0) {
    put('camera_images_annotated', summary.photos);
    put('camera_images_with_people', summary.photosWithPeople);
    put('camera_images_no_people', summary.photos - summary.photosWithPeople);
    put('camera_images_one_person', report.people.photosWithOnePerson);
    put('camera_images_group', report.people.photosWithGroup);
    put('camera_people_total', summary.people);
    put('camera_people_with_merch', summary.withMerch);
    put('camera_avg_people_per_image', summary.peoplePerPhoto);
    const counts = { gender: summary.byGender, age: summary.byAge, emotion: summary.byEmotion, merch: summary.byMerch };
    for (const group of PERSON_GROUPS) for (const key of keysFor(vocabulary, group, counts[group])) putOption(group, key, counts[group][key] ?? 0);
  }

  // Why photos were declined: sent once the event has a declined photo.
  if (report.photos.rejected > 0) {
    const byReason = Object.fromEntries(report.vetting.rejectReasons.map((row) => [row.id, row.count]));
    for (const key of keysFor(vocabulary, 'reject_reason', byReason)) putOption('reject_reason', key, byReason[key] ?? 0);
    put('camera_images_rejected_no_reason', report.vetting.rejectedWithoutReasons);
  }
  return cleanCounterPayload({ totals, averages, labels });
}

export const hasCounters = (set: CounterSet | null | undefined): boolean => Boolean(set) && Object.keys(set!.totals).length + Object.keys(set!.averages).length > 0;

const sameMap = <T>(a: Record<string, T> | undefined, b: Record<string, T>): boolean => {
  const left = a ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(b)]);
  return [...keys].every((key) => left[key] === b[key]);
};

/** Whether two sets say the same thing (a push of the same numbers and labels is not made again; a label that changed is a change). */
export function sameCounters(a: CounterSet | null | undefined, b: CounterSet): boolean {
  return Boolean(a) && sameMap(a!.totals, b.totals) && sameMap(a!.averages, b.averages) && sameMap(a!.labels, b.labels);
}

/** What a stored set looks like after a round trip through the database: only finite numbers and text labels. */
export function parseCounterSet(value: unknown): CounterSet | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { totals?: unknown; averages?: unknown; labels?: unknown };
  const numbers = (map: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (map && typeof map === 'object') for (const [key, number] of Object.entries(map as Record<string, unknown>)) if (typeof number === 'number' && Number.isFinite(number)) out[key] = number;
    return out;
  };
  const texts = (map: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (map && typeof map === 'object') for (const [key, text] of Object.entries(map as Record<string, unknown>)) if (typeof text === 'string') out[key] = text;
    return out;
  };
  return { totals: numbers(row.totals), averages: numbers(row.averages), labels: texts(row.labels) };
}

export interface CounterRow {
  key: string;
  label: string;
  kind: CounterKind;
  source: CounterSource;
  definition: string;
  /** The value that would be sent; null when there is none yet (an average before any decision, a family before any marked photo). */
  value: number | null;
}

/**
 * The counters with the value that would be sent, for the preview: the fixed ones, then each family with a row for every name the set holds (the label as it would go), and a placeholder row
 * for a family that has none yet, so the list always says what exists.
 */
export function counterRows(set: CounterSet): CounterRow[] {
  const rows: CounterRow[] = [];
  const addFixed = (source: CounterSource) => {
    for (const counter of COMPUTABLE_COUNTERS.filter((c) => c.source === source)) rows.push({ ...counter, value: (counter.kind === 'total' ? set.totals : set.averages)[counter.key] ?? null });
  };
  const addFamilies = (groups: readonly VocabGroup[]) => {
    for (const item of COUNTER_FAMILIES.filter((candidate) => groups.includes(candidate.group))) {
      const names = Object.keys(set.totals).filter((name) => name.startsWith(item.prefix));
      if (names.length === 0) rows.push({ key: item.placeholder, label: `Camera: ${item.word}, one for each option`, kind: 'total', source: item.source, definition: item.definition, value: null });
      for (const name of names) rows.push({ key: name, label: set.labels[name] ?? name, kind: 'total', source: item.source, definition: item.definition, value: set.totals[name] });
    }
  };
  addFixed('photos');
  addFixed('journey');
  addFixed('annotations');
  addFamilies(PERSON_GROUPS);
  addFamilies(['reject_reason']);
  addFixed('reasons');
  return rows;
}
