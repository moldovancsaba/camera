/**
 * The counters for messmass (issue 521, phase 1; docs/ANALYTICS_AUDIT.md section 7.6, owner decision 245): the list of numbers that go to messmass, and the pure functions that make them from the
 * report of lib/analytics/report.ts. **Counters only, never a person**: no name, e-mail, reviewer or photo leaves camera, only totals (decision 241).
 *
 * The list is the audit's. Six of its counters can be computed from the data that exists; the rest need the journey recording (after the match), the fixed list of decline reasons or the share
 * recording, and are **never sent as a zero** (a zero would say "nobody shared" when the truth is "nobody counted"): they are listed with what they wait for. The visits of the tracked links
 * already go to messmass through their own channel (lib/short-links/sync.ts) and are not part of this list.
 *
 * What a counter is, so it can be checked against messmass: a **total** is a whole running total for the event (every photo ever counted, never a day's change), so a repeat of the same push
 * changes nothing; an **average** is not additive and is sent as a whole value that messmass must store as it is, with no baseline. Pure and DOM-free; unit-tested in counters.test.ts.
 */

import type { EventReport } from './report';

export type CounterKind = 'total' | 'average';

export interface CounterDefinition {
  /** The name in messmass: camelCase, the same string as the key in `projects.stats` and in the variable catalog (docs/ANALYTICS_AUDIT.md section 6). */
  key: string;
  label: string;
  kind: CounterKind;
  /** What it counts, in words. */
  definition: string;
}

/** The counters the existing data can give. */
export const COMPUTABLE_COUNTERS: readonly CounterDefinition[] = [
  { key: 'imagesTaken', label: 'Images taken', kind: 'total', definition: 'Photos taken or uploaded by users: originals, not removed from the event, picture not gone. Photos an editor added are not counted.' },
  { key: 'imagesApproved', label: 'Images approved', kind: 'total', definition: 'Of those, the photos that are approved now.' },
  { key: 'imagesRejected', label: 'Images declined', kind: 'total', definition: 'Of those, the photos that are declined now.' },
  { key: 'imagesShownOnSlideshow', label: 'Images shown on the slideshow', kind: 'total', definition: 'Plays: how many times a photo of the event appeared on a giant screen, all slideshows, counted from the running play count of each photo.' },
  { key: 'avgVettingSeconds', label: 'Average vetting time (seconds)', kind: 'average', definition: 'Average time from the photo being handed in to its first decision, over the photos that have one. Not sent until a photo was decided.' },
  { key: 'consentAccepted', label: 'Consents accepted', kind: 'total', definition: 'Photos whose user accepted at least one consent (the consent is stored on the photo; only acceptances exist).' },
];

export interface WaitingCounter {
  key: string;
  label: string;
  why: string;
  waitsFor: 'journey recording' | 'share page recording' | 'decline reasons';
}

/** The counters of the audit's list that cannot be computed yet, and what each waits for. */
export const WAITING_COUNTERS: readonly WaitingCounter[] = [
  { key: 'journeyOpens', label: 'Journey opens', why: 'No page view or session is recorded: only a saved photo leaves a trace.', waitsFor: 'journey recording' },
  { key: 'journeyCompleted', label: 'Journeys completed', why: 'Needs the opens and the steps (opened to saved).', waitsFor: 'journey recording' },
  { key: 'cameraDenied', label: 'Camera denied', why: 'The user sees the camera error; the server sees nothing.', waitsFor: 'journey recording' },
  { key: 'retakes', label: 'Retakes', why: 'A retake leaves no trace: only the photo that was saved exists.', waitsFor: 'journey recording' },
  { key: 'shares', label: 'Shares', why: 'The share counter of a photo is only ever set to 0 and the share buttons make no server call.', waitsFor: 'share page recording' },
  { key: 'downloads', label: 'Downloads', why: 'The download counter of a photo is only ever set to 0.', waitsFor: 'share page recording' },
  { key: 'consentAbandoned', label: 'Consents abandoned', why: 'Only acceptances are stored; someone who leaves at the consent page leaves nothing.', waitsFor: 'journey recording' },
  { key: 'declined<Reason>', label: 'Declined, by reason', why: 'The reason is free text; one counter for each reason needs the fixed list (decision 244).', waitsFor: 'decline reasons' },
];

/** The numbers to send: totals and averages by messmass name. Only counters that have a value are in it. */
export interface CounterSet {
  totals: Record<string, number>;
  averages: Record<string, number>;
}

export const NO_COUNTERS: CounterSet = { totals: {}, averages: {} };

const whole = (value: number): number => Math.max(0, Math.round(value));

/** The counters of an event from its report. The report must cover the whole event (no range of days): a counter is a running total. */
export function buildCounters(report: EventReport): CounterSet {
  const totals: Record<string, number> = {
    imagesTaken: whole(report.photos.taken),
    imagesApproved: whole(report.photos.approved),
    imagesRejected: whole(report.photos.rejected),
    imagesShownOnSlideshow: whole(report.screens.plays),
    consentAccepted: whole(report.consents.photosWithConsent),
  };
  const averages: Record<string, number> = {};
  if (report.vetting.timeToFirstDecision.avgSeconds !== null) averages.avgVettingSeconds = whole(report.vetting.timeToFirstDecision.avgSeconds);
  return { totals, averages };
}

export const hasCounters = (set: CounterSet | null | undefined): boolean => Boolean(set) && Object.keys(set!.totals).length + Object.keys(set!.averages).length > 0;

const sameMap = (a: Record<string, number> | undefined, b: Record<string, number>): boolean => {
  const left = a ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(b)]);
  return [...keys].every((key) => left[key] === b[key]);
};

/** Whether two sets say the same thing (a push of the same numbers is not made again). */
export function sameCounters(a: CounterSet | null | undefined, b: CounterSet): boolean {
  return Boolean(a) && sameMap(a!.totals, b.totals) && sameMap(a!.averages, b.averages);
}

/** What a stored set looks like after a round trip through the database: only known names with finite numbers. */
export function parseCounterSet(value: unknown): CounterSet | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { totals?: unknown; averages?: unknown };
  const clean = (map: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (map && typeof map === 'object') for (const [key, number] of Object.entries(map as Record<string, unknown>)) if (typeof number === 'number' && Number.isFinite(number)) out[key] = number;
    return out;
  };
  return { totals: clean(row.totals), averages: clean(row.averages) };
}

export interface CounterRow {
  key: string;
  label: string;
  kind: CounterKind;
  definition: string;
  /** The value that would be sent; null when there is none yet (an average before any decision). */
  value: number | null;
}

/** The computable counters with the value that would be sent, for the preview. */
export function counterRows(set: CounterSet): CounterRow[] {
  return COMPUTABLE_COUNTERS.map((counter) => ({ ...counter, value: (counter.kind === 'total' ? set.totals : set.averages)[counter.key] ?? null }));
}
