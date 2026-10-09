/**
 * Slideshow diagnostics (camera#476, step S1): what the giant-screen player reports so the next freeze leaves evidence.
 * The player collects small events (a slide shown, a playlist call, an image preload, the refill lock, a heartbeat, a stall, an error) and
 * sends them in batches. This file is the shape of a batch and the sanitiser the public endpoint runs on whatever a browser sends: pure and
 * DOM-free, so it is unit-tested. Same promises as the capture diagnostics (lib/camera/diagnostics.ts): no image, name, e-mail, cookie, IP
 * address or stable device identifier; a submission id is cut to its last 6 characters, an address to its host; allowlisted and clamped.
 */

export const SLIDESHOW_DIAGNOSTIC_VERSION = 1 as const;
export const SLIDESHOW_DIAGNOSTIC_ENDPOINT = '/api/observability/slideshow-diagnostic';
/** Hard cap on the request body. A batch of 100 events is about 8 KB. */
export const SLIDESHOW_DIAGNOSTIC_MAX_BYTES = 16384;
export const SLIDESHOW_DIAGNOSTIC_MAX_EVENTS = 100;

export type SlideshowEventType = 'slide_shown' | 'playlist' | 'preload' | 'lock' | 'heartbeat' | 'stall' | 'error';
export type SlideshowEventValue = number | boolean | string;
export interface SlideshowEvent {
  /** Milliseconds since the page started. */
  t: number;
  type: SlideshowEventType;
  [field: string]: SlideshowEventValue;
}
export interface SlideshowBatch {
  v: typeof SLIDESHOW_DIAGNOSTIC_VERSION;
  slideshowId: string;
  variant: 'fullscreen' | 'embedded';
  /** Random per page load, kept only in memory. */
  session: string;
  uptimeS: number;
  events: SlideshowEvent[];
}

type Field = { n: [min: number, max: number] } | { b: true } | { s: RegExp } | { e: readonly string[] };
const n = (min: number, max: number): Field => ({ n: [min, max] });
const MS = n(0, 3_600_000);
const COUNT = n(0, 100_000);
const HOST = { s: /^[a-z0-9.-]{1,60}$/i } as const;
const VISIBILITY = { e: ['visible', 'hidden', 'prerender'] } as const;

/** The fields each event type may carry. Anything else is dropped. */
const FIELDS: Record<SlideshowEventType, Record<string, Field>> = {
  // A slide became the one on screen. `fetches` is how often the browser fetched its picture (2 or more: the preload did not serve the screen).
  slide_shown: { id: { s: /^[a-z0-9]{1,12}$/i }, dup: { b: true }, q: COUNT, gapMs: MS, fetches: COUNT, loadMs: MS, bytes: n(0, 1e9), nw: n(0, 65536), nh: n(0, 65536), host: HOST, preloaded: { b: true } },
  playlist: { limit: COUNT, excl: COUNT, status: n(0, 999), ms: MS, got: COUNT, fresh: COUNT, serverMs: MS },
  preload: { ms: MS, outcome: { e: ['ok', 'error', 'timeout'] }, bytes: n(0, 1e9), host: HOST },
  lock: { ms: MS },
  heartbeat: { vis: VISIBILITY, rafGapMs: MS, longTasks: COUNT, longMaxMs: MS, heapMb: n(0, 100_000), preloaded: COUNT, q: COUNT, online: { b: true }, net: { e: ['slow-2g', '2g', '3g', '4g'] }, downlink: n(0, 10_000), rtt: n(0, 100_000) },
  stall: { sinceMs: MS, q: COUNT, busy: { b: true }, vis: VISIBILITY },
  error: { msg: { s: /^[\s\S]{1,80}$/ } },
};
const TYPES = Object.keys(FIELDS) as SlideshowEventType[];

const SESSION_PATTERN = /^[a-z0-9-]{8,40}$/;
const SLIDESHOW_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}

function sanitizeEvent(input: unknown): SlideshowEvent | null {
  if (!isRecord(input) || typeof input.type !== 'string' || !TYPES.includes(input.type as SlideshowEventType)) return null;
  const type = input.type as SlideshowEventType;
  const t = clamp(input.t, 0, 1e10);
  if (t === undefined) return null;
  const out: SlideshowEvent = { t, type };
  for (const [name, rule] of Object.entries(FIELDS[type])) {
    const raw = input[name];
    let value: SlideshowEventValue | undefined;
    if ('n' in rule) value = clamp(raw, rule.n[0], rule.n[1]);
    else if ('b' in rule) value = typeof raw === 'boolean' ? raw : undefined;
    else if ('e' in rule) value = typeof raw === 'string' && rule.e.includes(raw) ? raw : undefined;
    else if (typeof raw === 'string') value = name === 'msg' ? raw.slice(0, 80) : rule.s.test(raw) ? raw : undefined;
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** A batch holding only allowlisted, clamped fields, or null when the input is not a batch of this version. At most 100 events are kept. */
export function sanitizeSlideshowDiagnostic(input: unknown): SlideshowBatch | null {
  if (!isRecord(input) || input.v !== SLIDESHOW_DIAGNOSTIC_VERSION) return null;
  const session = typeof input.session === 'string' ? input.session.trim().toLowerCase() : '';
  if (!SESSION_PATTERN.test(session)) return null;
  if (typeof input.slideshowId !== 'string' || !SLIDESHOW_ID_PATTERN.test(input.slideshowId)) return null;
  const variant = input.variant === 'embedded' ? 'embedded' : input.variant === 'fullscreen' ? 'fullscreen' : null;
  if (!variant || !Array.isArray(input.events)) return null;
  const events = input.events.slice(0, SLIDESHOW_DIAGNOSTIC_MAX_EVENTS).map(sanitizeEvent).filter((e): e is SlideshowEvent => e !== null);
  if (events.length === 0) return null;
  return { v: SLIDESHOW_DIAGNOSTIC_VERSION, slideshowId: input.slideshowId, variant, session, uptimeS: clamp(input.uptimeS, 0, 1e7) ?? 0, events };
}

/** The last 6 characters of a submission id: enough to see a photo repeat, not enough to find it. */
export function shortId(id: string): string {
  return id.slice(-6);
}

/** The host of an address (or `data` for an inline image), never the path or the query. */
export function hostOf(url: string): string {
  if (url.startsWith('data:')) return 'data';
  try {
    return new URL(url, 'http://localhost').hostname.slice(0, 60) || 'self';
  } catch {
    return 'unknown';
  }
}
