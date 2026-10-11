/**
 * The journey recording (issue 521, phase 2; docs/JOURNEY_RECORDING.md; owner decision 241): the **vocabulary** of what is recorded about a user's way through the capture pages, and the
 * pure function that makes a batch from what a browser sends. The browser (lib/journey/client.ts) and the server (app/api/observability/journey) share this file, so a name or a key that
 * is not in the lists below can neither be sent nor stored.
 *
 * What a record is: one of the names below, one key from that name's fixed list (a step, a channel, an outcome; **never free text**), and the milliseconds since the page opened. Nothing
 * else: no IP address, no user agent, no cookie, no name, no e-mail, no photo, no address of a page. The batch carries an anonymous random id of the page visit (kept in the page's memory
 * only), which links the records of one visit and nothing else, and the event.
 *
 * Pure and DOM-free so it is unit-tested (events.test.ts).
 */

export const JOURNEY_VERSION = 1 as const;
export const JOURNEY_ENDPOINT = '/api/observability/journey';
/** Hard cap on the body of one batch; a batch is well under 1 KB. */
export const JOURNEY_MAX_BYTES = 4096;
/** Most records one batch may carry; the rest are dropped. */
export const JOURNEY_MAX_EVENTS = 25;
/** The longest time a record may claim since the page opened: 6 hours. A page left open all day is not a six-hour journey. */
export const JOURNEY_MAX_MS = 6 * 60 * 60 * 1000;

/** The steps of the journey, in the order of the funnel. `consent` is the accept page or the acceptance box on the Who-are-you page; `saved` is the photo saved. */
export const STEP_KEYS = ['welcome', 'consent', 'who-are-you', 'cta', 'restart', 'frame', 'layout', 'message', 'camera', 'reframe', 'saved', 'thank-you'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const SHARE_CHANNELS = ['copy', 'facebook', 'twitter', 'linkedin', 'whatsapp'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

/** How long a user took from opening the page to the first saved photo. */
export const TIME_BUCKETS = ['under-1m', '1-3m', '3-10m', '10-30m', 'over-30m'] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

export const DEVICE_KEYS = ['ios', 'android', 'desktop', 'unknown'] as const;

/**
 * Every name that can be recorded, with the keys it may carry (`null`: no key) and who may record it. `client` names arrive through the public endpoint; `server` names are written by
 * the server itself when the share page is opened and the photo is downloaded (those make a server call anyway), so the endpoint refuses them. `serverKey` marks a name whose key the
 * server makes (the device kind of a `journey.start`, read from the request and not kept): whatever key the browser sends is ignored.
 */
type VocabularyEntry = { keys: readonly string[] | null; from: 'client' | 'server'; serverKey?: true };

export const JOURNEY_VOCABULARY = {
  /** The page opened. The key is the kind of device, which the server reads from the request and does not keep. */
  'journey.start': { keys: DEVICE_KEYS, from: 'client', serverKey: true },
  /** The page opened again after a sign-in (the sign-in leaves the page and comes back); not another visit. */
  'journey.resume': { keys: null, from: 'client' },
  /** A step was reached for the first time in this visit. */
  'step.reach': { keys: STEP_KEYS, from: 'client' },
  /** The consent was shown (`page`: its own page, `box`: the box on the Who-are-you page), once per visit. */
  'consent.shown': { keys: ['page', 'box'], from: 'client' },
  'consent.accept': { keys: ['page', 'box'], from: 'client' },
  /** The live camera of a desktop was asked for: it started, the user said no, or there is no camera or it is in use. A phone takes the photo with its own camera app, which asks nothing on the page. */
  'camera.permission': { keys: ['granted', 'denied', 'unavailable'], from: 'client' },
  /** A photo was taken, and how (the device's own camera, a real still, a video frame). */
  'photo.taken': { keys: ['system', 'still', 'frame'], from: 'client' },
  /** Back from the move-and-zoom step to the camera. */
  'photo.retake': { keys: null, from: 'client' },
  'photo.save': { keys: ['ok', 'failed'], from: 'client' },
  /** The first saved photo of the visit; the key is how long it took. */
  'journey.complete': { keys: TIME_BUCKETS, from: 'client' },
  'share.click': { keys: SHARE_CHANNELS, from: 'client' },
  /** The public photo page was opened by a person (not a link preview). */
  'share.view': { keys: null, from: 'server' },
  /** The photo was downloaded from the public photo page. */
  'download': { keys: null, from: 'server' },
} as const satisfies Record<string, VocabularyEntry>;

export type JourneyName = keyof typeof JOURNEY_VOCABULARY;

export const JOURNEY_NAMES = Object.keys(JOURNEY_VOCABULARY) as JourneyName[];

export const isJourneyName = (value: unknown): value is JourneyName => typeof value === 'string' && Object.prototype.hasOwnProperty.call(JOURNEY_VOCABULARY, value);

/** The empty key: a name that carries none is stored with this, so every row has the same shape and the rollup has one unique key. */
export const NO_KEY = '';

/** Whether `key` is allowed for `name` (`null`/empty for a name without keys). */
export function isJourneyKey(name: JourneyName, key: unknown): boolean {
  const keys = JOURNEY_VOCABULARY[name].keys as readonly string[] | null;
  if (keys === null) return key === null || key === undefined || key === NO_KEY;
  return typeof key === 'string' && keys.includes(key);
}

export interface JourneyEvent {
  name: JourneyName;
  /** `NO_KEY` when the name has none. */
  key: string;
  /** Milliseconds since the page opened, whole, 0 to `JOURNEY_MAX_MS`. */
  ms: number;
}

export interface JourneyBatch {
  /** The anonymous random id of the page visit. */
  session: string;
  /** The event as the page names it (its Mongo id or its UUID); the server resolves it and refuses one it does not know. */
  event: string;
  events: JourneyEvent[];
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** A time in milliseconds, whole, inside the allowed range; a value that is not a finite number is 0. */
export function clampMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(JOURNEY_MAX_MS, Math.max(0, Math.round(value)));
}

/**
 * The batch a browser sent, or null when it is not one. The body is `{ v: 1, s: <visit id>, e: <event>, ev: [[name, key | null, ms], ...] }`. A record whose name or key is not in the
 * vocabulary, or whose name the browser may not send, is **dropped** (the others stay); a batch with no valid record is null. Never throws.
 */
export function parseJourneyBatch(text: string): JourneyBatch | null {
  if (text.length === 0 || text.length > JOURNEY_MAX_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { v, s, e, ev } = body as { v?: unknown; s?: unknown; e?: unknown; ev?: unknown };
  if (v !== JOURNEY_VERSION || typeof s !== 'string' || !ID_PATTERN.test(s) || typeof e !== 'string' || !ID_PATTERN.test(e) || !Array.isArray(ev)) return null;
  const events: JourneyEvent[] = [];
  for (const raw of ev.slice(0, JOURNEY_MAX_EVENTS)) {
    if (!Array.isArray(raw)) continue;
    const [name, key, ms] = raw as unknown[];
    if (!isJourneyName(name) || JOURNEY_VOCABULARY[name].from !== 'client') continue;
    const entry: VocabularyEntry = JOURNEY_VOCABULARY[name];
    // The key of a `journey.start` is made by the server; whatever the browser put there is ignored.
    if (entry.serverKey) {
      events.push({ name, key: NO_KEY, ms: clampMs(ms) });
      continue;
    }
    if (!isJourneyKey(name, key ?? NO_KEY)) continue;
    events.push({ name, key: typeof key === 'string' ? key : NO_KEY, ms: clampMs(ms) });
  }
  return events.length > 0 ? { session: s, event: e, events } : null;
}

/**
 * How long a user took from opening the page to the first saved photo, in the buckets of the Analytics view. Pure.
 */
export function timeBucketOf(ms: number): TimeBucket {
  const minutes = clampMs(ms) / 60000;
  if (minutes < 1) return 'under-1m';
  if (minutes < 3) return '1-3m';
  if (minutes < 10) return '3-10m';
  if (minutes < 30) return '10-30m';
  return 'over-30m';
}
