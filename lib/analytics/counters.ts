/**
 * The counters for messmass (issue 521, phase 1; docs/ANALYTICS_AUDIT.md section 7.6, owner decision 245): the list of numbers that go to messmass, and the pure functions that make them from the
 * report of lib/analytics/report.ts. **Counters only, never a person**: no name, e-mail, reviewer or photo leaves camera, only totals (decision 241).
 *
 * The list is the audit's. Six of its counters come from the photos; seven more from the journey recording (lib/journey, issue 521 phase 2) **once the event has any journey record**; the one
 * that needs the fixed list of decline reasons (decision 244) waits. A counter that cannot be counted is **never sent as a zero** (a zero would say "nobody shared" when the truth is "nobody
 * counted"): an event with no journey record sends no journey counter at all, and the list says what each one waits for. The visits of the tracked links
 * already go to messmass through their own channel (lib/short-links/sync.ts) and are not part of this list.
 *
 * What a counter is, so it can be checked against messmass: a **total** is a whole running total for the event (every photo ever counted, never a day's change), so a repeat of the same push
 * changes nothing; an **average** is not additive and is sent as a whole value that messmass must store as it is, with no baseline. Pure and DOM-free; unit-tested in counters.test.ts.
 */

import { isRecorded, type JourneySummary } from './journey';
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
  // From the journey recording: counted from the day the recording started, and not sent at all for an event that has no journey record (never a zero).
  { key: 'journeyOpens', label: 'Journey opens', kind: 'total', definition: 'Visits to the capture page (a page load with the event; a return from a sign-in is not another visit), since the recording started. Not a count of different people.' },
  { key: 'journeyCompleted', label: 'Journeys completed', kind: 'total', definition: 'Visits that saved a photo (the first photo of the visit), since the recording started.' },
  { key: 'cameraDenied', label: 'Camera denied', kind: 'total', definition: 'Times a user said no when the live camera of a desktop asked for permission. A phone takes the photo with its own camera app and asks nothing on the page.' },
  { key: 'retakes', label: 'Retakes', kind: 'total', definition: 'Times a user went back from the move-and-zoom step to take the photo again.' },
  { key: 'consentAbandoned', label: 'Consents abandoned', kind: 'total', definition: 'Visits that were shown the consent and did not accept it (shown minus accepted, for the consent page and for the box on the Who-are-you page).' },
  { key: 'shares', label: 'Shares', kind: 'total', definition: 'Presses of a share button (copy the link, Facebook, X, LinkedIn, WhatsApp) on the page after the photo was saved.' },
  { key: 'downloads', label: 'Downloads', kind: 'total', definition: 'Downloads of the photo from its public page.' },
];

export interface WaitingCounter {
  key: string;
  label: string;
  why: string;
  waitsFor: 'decline reasons';
}

/** The counters of the audit's list that cannot be computed yet, and what each waits for. */
export const WAITING_COUNTERS: readonly WaitingCounter[] = [
  { key: 'declined<Reason>', label: 'Declined, by reason', why: 'The reason is free text; one counter for each reason needs the fixed list (decision 244).', waitsFor: 'decline reasons' },
];

/** The numbers to send: totals and averages by messmass name. Only counters that have a value are in it. */
export interface CounterSet {
  totals: Record<string, number>;
  averages: Record<string, number>;
}

export const NO_COUNTERS: CounterSet = { totals: {}, averages: {} };

const whole = (value: number): number => Math.max(0, Math.round(value));

/**
 * The counters of an event from its report, and from its journey summary when it has one. The report and the summary must cover the whole event (no range of days): a counter is a running
 * total. A summary of an event with no journey record (`isRecorded` false) adds nothing: the journey counters are left out, not sent as zeros.
 */
export function buildCounters(report: EventReport, journey?: JourneySummary | null): CounterSet {
  const totals: Record<string, number> = {
    imagesTaken: whole(report.photos.taken),
    imagesApproved: whole(report.photos.approved),
    imagesRejected: whole(report.photos.rejected),
    imagesShownOnSlideshow: whole(report.screens.plays),
    consentAccepted: whole(report.consents.photosWithConsent),
  };
  if (isRecorded(journey)) {
    totals.journeyOpens = whole(journey.opens);
    totals.journeyCompleted = whole(journey.completed);
    totals.cameraDenied = whole(journey.camera.denied);
    totals.retakes = whole(journey.photos.retakes);
    totals.consentAbandoned = whole(journey.consent.abandoned);
    totals.shares = whole(journey.shares.clicks);
    totals.downloads = whole(journey.shares.downloads);
  }
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
