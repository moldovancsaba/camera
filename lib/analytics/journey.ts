/**
 * The journey figures of the Analytics view (issue 521, phase 2; docs/JOURNEY_RECORDING.md): visits, reached steps and transitions, photo/upload outcomes, CTA and sign-in outcomes, consent and share interactions. Counts and completion duration sums/samples come from durable daily aggregates; medians and duration bands use raw rows retained for 30 days. Journey events contain no guest identity.
 *
 * What the numbers are, and are not:
 * - **A visit is a page load** with the anonymous id the page made for it (it is not a person: the same user opening the link twice is two visits, and a return from a sign-in is not a
 *   second one). Opens are recorded once the page has the event, so a page that never loaded the event is not counted.
 * - **Recorded from the day the recording started** (`since`). Before it there is nothing to count; an event with no row at all is "not recorded", never a row of zeros.
 * - The days are **UTC days** (the daily counts are kept per UTC day), whatever clock the rest of the report uses.
 * - The browser sends the records, so the counts can be inflated by someone who wants to (a rate limit and a fixed vocabulary bound it). They are for the service and the organisers, not a
 *   measure of anything that is paid for.
 *
 * Pure and DOM-free except for `loadJourneySummary`, which only reads. Unit-tested in journey.test.ts.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { CAPTURE_METHOD_KEYS, DEVICE_KEYS, SHARE_CHANNELS, STEP_KEYS, TIME_BUCKETS, UPLOAD_DURATION_BUCKETS, isJourneyName, type JourneyName } from '@/lib/journey/events';
import { average, dayInRange, median } from './time';

export interface JourneyRow {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  name: JourneyName;
  key: string;
  count: number;
  /** Durable completed-journey duration totals; absent on legacy daily rows. */
  durationTotalMs?: number;
  durationSamples?: number;
}

export interface JourneyTally {
  id: string;
  label: string;
  count: number;
}

export const STEP_LABELS: Record<(typeof STEP_KEYS)[number], string> = {
  welcome: 'Welcome page',
  consent: 'Consent',
  'who-are-you': 'Who are you',
  cta: 'Call-to-action page',
  restart: 'Restart page',
  frame: 'Choosing a frame',
  layout: 'Choosing a design',
  message: 'Choosing a message',
  camera: 'Camera',
  reframe: 'Move and zoom',
  saved: 'Photo saved',
  'thank-you': 'Thank-you pages',
};

const DEVICE_LABELS: Record<string, string> = { ios: 'iPhone or iPad', android: 'Android', desktop: 'Desktop', unknown: 'Not recognised' };
const METHOD_LABELS: Record<string, string> = { system: "The device's own camera", still: 'Live camera, a real still', frame: 'Live camera, a video frame' };
const TIME_LABELS: Record<(typeof TIME_BUCKETS)[number], string> = { 'under-1m': 'Under 1 minute', '1-3m': '1 to 3 minutes', '3-10m': '3 to 10 minutes', '10-30m': '10 to 30 minutes', 'over-30m': 'Over 30 minutes' };
const CHANNEL_LABELS: Record<(typeof SHARE_CHANNELS)[number], string> = { copy: 'Copy the link', facebook: 'Facebook', twitter: 'X (Twitter)', linkedin: 'LinkedIn', whatsapp: 'WhatsApp' };

export interface JourneySummary {
  /** The first and last UTC day with any record for the event (whatever range was asked); null when nothing was ever recorded. */
  since: string | null;
  lastDay: string | null;
  /** The asked range ends before the recording began, so a zero there is "not recording yet", not "nobody came". */
  rangeBeforeStart: boolean;
  opens: number;
  /** Returns from a sign-in (not counted as opens). */
  resumed: number;
  devices: JourneyTally[];
  steps: Array<JourneyTally & { shareOfOpens: number | null }>;
  /** Observed direct step-to-step movement, counted once per visit and directed edge. */
  transitions: Array<{ id: string; label: string; from: string; to: string; count: number; shareOfFrom: number | null }>;
  completed: number;
  /** Visits with a first successful photo save over opens; null before the first open. */
  completionRate: number | null;
  /** Visits that reached the final configured page after saving a photo. */
  finished: number;
  /** Finished journeys over opens; null before the first open. */
  finishRate: number | null;
  timeToComplete: JourneyTally[];
  /** The median seconds from opening through the last configured page over raw rows still kept (30 days); null when there are none. */
  medianCompleteSeconds: number | null;
  /** The average seconds from opening the capture page through the last configured page. */
  averageCompleteSeconds: number | null;
  averageCompleteSamples: number;
  completedDurationTotalMs: number;
  /** A unique visit is counted once after the first CTA action. */
  ctaClicks: number;
  ctaClickRate: number | null;
  ctaActions: Array<JourneyTally & { shareOfActions: number | null }>;
  ctaReturns: number;
  /** Provider or pseudo-form selections/submissions; these indicate a chosen route, not a successful SSO login. */
  loginMethods: Array<JourneyTally & { shareOfChoices: number | null }>;
  loginMethodChoices: number;
  authentication: Array<JourneyTally & { shareOfResults: number | null }>;
  camera: { granted: number; denied: number; unavailable: number; deniedRate: number | null };
  photos: { taken: number; byMethod: JourneyTally[]; retakes: number; retakesPerPhoto: number | null; uploadStarted: number; uploadSucceeded: number; uploadFailed: number; uploadsByDeviceMethod: Array<{ id: string; label: string; started: number; succeeded: number; failed: number; durations: JourneyTally[] }> };
  saves: { ok: number; failed: number };
  consent: { shown: number; accepted: number; abandoned: number; page: { shown: number; accepted: number }; box: { shown: number; accepted: number } };
  shares: { clicks: number; byChannel: JourneyTally[]; views: number; downloads: number };
  days: Array<{ day: string; opens: number; completed: number }>;
}

const whole = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** The journey figures from the daily counts, for a range of UTC days (both ends included, empty is open). Pure. */
export function summarizeJourney(rows: readonly JourneyRow[], range: { from?: string | null; to?: string | null } = {}, medianMs: readonly number[] = []): JourneySummary {
  const allDays = rows.filter((row) => row.count > 0).map((row) => row.day).sort();
  const since = allDays[0] ?? null;
  const lastDay = allDays[allDays.length - 1] ?? null;

  const counts = new Map<string, number>();
  const durationTotalMs = rows.filter((row) => dayInRange(row.day, range.from, range.to)).reduce((sum, row) => sum + (row.name === 'journey.flow.complete' ? Math.max(0, row.durationTotalMs ?? 0) : 0), 0);
  const durationSamples = rows.filter((row) => dayInRange(row.day, range.from, range.to)).reduce((sum, row) => sum + (row.name === 'journey.flow.complete' ? Math.max(0, row.durationSamples ?? 0) : 0), 0);
  const dayRows = new Map<string, { opens: number; completed: number }>();
  for (const row of rows) {
    if (!dayInRange(row.day, range.from, range.to)) continue;
    const count = whole(row.count);
    if (count === 0) continue;
    counts.set(`${row.name}\u0000${row.key}`, (counts.get(`${row.name}\u0000${row.key}`) ?? 0) + count);
    if (row.name === 'journey.start' || row.name === 'journey.complete') {
      const day = dayRows.get(row.day) ?? { opens: 0, completed: 0 };
      if (row.name === 'journey.start') day.opens += count;
      else day.completed += count;
      dayRows.set(row.day, day);
    }
  }
  const at = (name: JourneyName, key = ''): number => counts.get(`${name}\u0000${key}`) ?? 0;
  const sum = (name: JourneyName, keys: readonly string[]): number => keys.reduce((total, key) => total + at(name, key), 0);
  const tallies = <T extends string>(name: JourneyName, keys: readonly T[], labels: Record<string, string>): JourneyTally[] => keys.map((key) => ({ id: key, label: labels[key] ?? key, count: at(name, key) }));

  const deviceKeys = ['ios', 'android', 'desktop', 'unknown'] as const;
  const opens = sum('journey.start', deviceKeys);
  const completed = TIME_BUCKETS.reduce((total, key) => total + at('journey.complete', key), 0);
  const finished = TIME_BUCKETS.reduce((total, key) => total + at('journey.flow.complete', key), 0);
  const cameraGranted = at('camera.permission', 'granted');
  const cameraDenied = at('camera.permission', 'denied');
  const cameraUnavailable = at('camera.permission', 'unavailable');
  const cameraAsked = cameraGranted + cameraDenied + cameraUnavailable;
  const methods = ['system', 'still', 'frame'] as const;
  const taken = sum('photo.taken', methods);
  const uploadStarted = at('photo.upload', 'started');
  const uploadSucceeded = at('photo.upload', 'succeeded');
  const uploadFailed = at('photo.upload', 'failed');
  const transitionCounts = new Map<string, number>();
  for (const row of rows) if (row.name === 'step.transition' && dayInRange(row.day, range.from, range.to)) transitionCounts.set(row.key, (transitionCounts.get(row.key) ?? 0) + whole(row.count));
  const transitions = [...transitionCounts.entries()].flatMap(([key, count]) => {
    const [from, to] = key.split('>');
    if (!STEP_KEYS.includes(from as (typeof STEP_KEYS)[number]) || !STEP_KEYS.includes(to as (typeof STEP_KEYS)[number])) return [];
    const fromCount = at('step.reach', from);
    return [{ id: key, from, to, label: `${STEP_LABELS[from as keyof typeof STEP_LABELS]} → ${STEP_LABELS[to as keyof typeof STEP_LABELS]}`, count, shareOfFrom: fromCount > 0 ? count / fromCount : null }];
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const actionKeys = ['external', 'continue'] as const;
  const ctaActionTotal = actionKeys.reduce((sum, key) => sum + at('cta.action', key), 0);
  const uploadDevices = DEVICE_KEYS;
  const uploadMethods = CAPTURE_METHOD_KEYS;
  const uploadLabels: Record<string, string> = { ios: 'iPhone or iPad', android: 'Android', desktop: 'Desktop', unknown: 'Not recognised', system: "device camera", still: 'live camera still', frame: 'video frame' };
  const uploadsByDeviceMethod = uploadDevices.flatMap((device) => uploadMethods.map((method) => {
    const prefix = `${device}_${method}`;
    const started = at('photo.upload.attempt', `${device}_${method}`);
    const succeeded = at('photo.upload.result', `${prefix}_succeeded`);
    const failed = at('photo.upload.result', `${prefix}_failed`);
    const durations = UPLOAD_DURATION_BUCKETS.map((bucket) => ({ id: bucket, label: ({ 'under-2s': 'Under 2 seconds', '2-5s': '2 to 5 seconds', '5-15s': '5 to 15 seconds', '15-60s': '15 seconds to 1 minute', 'over-60s': 'Over 1 minute' })[bucket], count: at('photo.upload.duration', `${prefix}_${bucket}`) }));
    return { id: prefix, label: `${uploadLabels[device]} · ${uploadLabels[method]}`, started, succeeded, failed, durations };
  })).filter((row) => row.started + row.succeeded + row.failed > 0);
  const authKeys = ['google_success', 'google_cancelled', 'google_provider_error', 'google_callback_error', 'google_session_expired', 'facebook_success', 'facebook_cancelled', 'facebook_provider_error', 'facebook_callback_error', 'facebook_session_expired'] as const;
  const authTotal = authKeys.reduce((sum, key) => sum + at('auth.result', key), 0);
  const retakes = at('photo.retake');
  const pageShown = at('consent.shown', 'page');
  const boxShown = at('consent.shown', 'box');
  const pageAccepted = at('consent.accept', 'page');
  const boxAccepted = at('consent.accept', 'box');
  const channels = tallies('share.click', SHARE_CHANNELS, CHANNEL_LABELS);

  const lastAsked = range.to && /^\d{4}-\d{2}-\d{2}$/.test(range.to) ? range.to : null;
  return {
    since,
    lastDay,
    rangeBeforeStart: since !== null && lastAsked !== null && lastAsked < since,
    opens,
    resumed: at('journey.resume'),
    devices: tallies('journey.start', deviceKeys, DEVICE_LABELS),
    steps: STEP_KEYS.map((key) => ({ id: key, label: STEP_LABELS[key], count: at('step.reach', key), shareOfOpens: opens > 0 ? at('step.reach', key) / opens : null })),
    transitions,
    completed,
    completionRate: opens > 0 ? completed / opens : null,
    finished,
    finishRate: opens > 0 ? finished / opens : null,
    timeToComplete: tallies('journey.flow.complete', TIME_BUCKETS, TIME_LABELS),
    medianCompleteSeconds: median(medianMs.map((ms) => Math.round(ms / 1000))),
    averageCompleteSeconds: durationSamples > 0 ? durationTotalMs / durationSamples / 1000 : average(medianMs.map((ms) => ms / 1000)),
    averageCompleteSamples: durationSamples || medianMs.length,
    completedDurationTotalMs: durationSamples > 0 ? durationTotalMs : Math.round((average(medianMs.map((ms) => ms / 1000)) ?? 0) * (medianMs.length || 0) * 1000),
    ctaClicks: at('cta.click'),
    ctaClickRate: at('step.reach', 'cta') > 0 ? at('cta.click') / at('step.reach', 'cta') : null,
    ctaActions: actionKeys.map((key) => ({ id: key, label: key === 'external' ? 'External link opened' : 'Continue pressed', count: at('cta.action', key), shareOfActions: ctaActionTotal > 0 ? at('cta.action', key) / ctaActionTotal : null })),
    ctaReturns: at('cta.return'),
    loginMethods: (() => {
      const choices = sum('login.method', ['google', 'facebook', 'pseudo']);
      return (['google', 'facebook', 'pseudo'] as const).map((key) => ({
        id: key,
        label: ({ google: 'Google selected', facebook: 'Facebook selected', pseudo: 'Pseudo form submitted' })[key],
        count: at('login.method', key),
        shareOfChoices: choices > 0 ? at('login.method', key) / choices : null,
      }));
    })(),
    loginMethodChoices: sum('login.method', ['google', 'facebook', 'pseudo']),
    authentication: authKeys.map((key) => {
      const [provider, outcome] = key.split('_');
      const providerLabel = provider === 'google' ? 'Google' : 'Facebook';
      const outcomeLabel = ({ success: 'completed', cancelled: 'cancelled', provider_error: 'provider error', callback_error: 'callback error', session_expired: 'session expired' } as Record<string, string>)[key.slice(provider.length + 1)] ?? outcome;
      return { id: key, label: `${providerLabel} ${outcomeLabel}`, count: at('auth.result', key), shareOfResults: authTotal > 0 ? at('auth.result', key) / authTotal : null };
    }),
    camera: { granted: cameraGranted, denied: cameraDenied, unavailable: cameraUnavailable, deniedRate: cameraAsked > 0 ? cameraDenied / cameraAsked : null },
    photos: { taken, byMethod: tallies('photo.taken', methods, METHOD_LABELS), retakes, retakesPerPhoto: taken > 0 ? retakes / taken : null, uploadStarted, uploadSucceeded, uploadFailed, uploadsByDeviceMethod },
    saves: { ok: at('photo.save', 'ok'), failed: at('photo.save', 'failed') },
    consent: {
      shown: pageShown + boxShown,
      accepted: pageAccepted + boxAccepted,
      // Shown and not accepted, for each form (a visit that saw the consent and did not accept it). A form that was accepted more often than shown (a resumed visit) is never below zero.
      abandoned: Math.max(0, pageShown - pageAccepted) + Math.max(0, boxShown - boxAccepted),
      page: { shown: pageShown, accepted: pageAccepted },
      box: { shown: boxShown, accepted: boxAccepted },
    },
    shares: { clicks: channels.reduce((total, row) => total + row.count, 0), byChannel: channels, views: at('share.view'), downloads: at('download') },
    days: [...dayRows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, row]) => ({ day, ...row })),
  };
}

/** Whether anything was ever recorded for the event: a figure of the journey exists only then, and is never shown (or sent) as a zero before. */
export const isRecorded = (summary: JourneySummary | null | undefined): summary is JourneySummary => Boolean(summary && summary.since);

/** The daily counts of an event, whole (the range is applied by `summarizeJourney`). Read only. */
export async function loadJourneyRows(db: Db, eventId: string): Promise<JourneyRow[]> {
  const docs = await db.collection(COLLECTIONS.JOURNEY_DAILY).find({ eventId }, { projection: { day: 1, name: 1, key: 1, count: 1, durationTotalMs: 1, durationSamples: 1 } }).toArray();
  const rows: JourneyRow[] = [];
  for (const doc of docs) {
    if (typeof doc.day !== 'string' || !isJourneyName(doc.name)) continue;
    rows.push({ day: doc.day, name: doc.name, key: typeof doc.key === 'string' ? doc.key : '', count: whole(doc.count), durationTotalMs: typeof doc.durationTotalMs === 'number' ? doc.durationTotalMs : undefined, durationSamples: typeof doc.durationSamples === 'number' ? doc.durationSamples : undefined });
  }
  return rows;
}

/** The milliseconds from opening through the last configured page, from the raw rows still kept (30 days). Read only. */
export async function loadCompleteMs(db: Db, eventId: string, range: { from?: string | null; to?: string | null } = {}): Promise<number[]> {
  const docs = await db.collection(COLLECTIONS.JOURNEY_EVENTS).find({ eventId, name: 'journey.flow.complete' }, { projection: { ms: 1, at: 1 } }).toArray();
  return docs
    .filter((doc) => {
      if (!range.from && !range.to) return true;
      const at = doc.at instanceof Date ? doc.at : typeof doc.at === 'string' ? new Date(doc.at) : null;
      return at !== null && !Number.isNaN(at.getTime()) && dayInRange(at.toISOString().slice(0, 10), range.from, range.to);
    })
    .map((doc) => doc.ms)
    .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0);
}

export async function loadJourneySummary(db: Db, eventId: string, range: { from?: string | null; to?: string | null } = {}): Promise<JourneySummary> {
  const [rows, ms] = await Promise.all([loadJourneyRows(db, eventId), loadCompleteMs(db, eventId, range)]);
  return summarizeJourney(rows, range, ms);
}
