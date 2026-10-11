/**
 * The browser side of the journey recording (issue 521, phase 2; docs/JOURNEY_RECORDING.md). **It must never slow, block or break the capture**, so this file is built around what it cannot do:
 *
 * - It **never throws** and **nothing is ever awaited by the page**: `record` only puts a small tuple in a list and, at most, starts a timer. Every call into the browser (`fetch`,
 *   `sendBeacon`, `AbortController`, `Blob`, timers) is inside a `try` that swallows the failure.
 * - It is **batched**: records wait `FLUSH_DELAY_MS` after the last one, so a step change is one request, not one per record; at most `JOURNEY_MAX_EVENTS` go in a request.
 * - **One request at a time.** A request that never answers is cut after `REQUEST_TIMEOUT_MS` (an aborted `fetch`), so a hanging server cannot pile up connections that the photo's own save
 *   would have to wait behind (HTTP/1.1 allows six to a host). While one is in flight the records wait in the list.
 * - It is **bounded**: a visit sends at most `MAX_RECORDS_PER_VISIT` records, whatever the page does, and the list never grows beyond that.
 * - It is **off unless started**: `start` is called only when the event answer says `journeyRecording: true`. Without it `record` is a no-op, so a switched-off recording sends not one byte.
 * - When the page is hidden or closed the rest goes out in one `sendBeacon` (the browser's own fire-and-forget), falling back to the same bounded `fetch`.
 *
 * What is sent: `{ v, s: <visit id>, e: <event>, ev: [[name, key | null, ms], ...] }` (lib/journey/events.ts). The visit id is random, made here and held in this module's memory only: no
 * cookie, no local or session storage. Nothing about the person, the device or the page address is in it. Everything is injectable (`deps`), so the behaviour is unit-tested without a browser
 * (client.test.ts) and with a hanging, failing and refusing server in the browser harness.
 */

import { JOURNEY_ENDPOINT, JOURNEY_MAX_BYTES, JOURNEY_MAX_EVENTS, JOURNEY_VERSION, NO_KEY, isJourneyKey, isJourneyName, timeBucketOf, JOURNEY_VOCABULARY, type JourneyName } from './events';

/** Records wait this long after the last one, so a step change is one request. */
export const FLUSH_DELAY_MS = 1500;
/** A request that has not answered by then is cut. */
export const REQUEST_TIMEOUT_MS = 4000;
/** The most records one visit sends, however long the page stays open. */
export const MAX_RECORDS_PER_VISIT = 40;

type Tuple = [name: JourneyName, key: string | null, ms: number];

export interface JourneyDeps {
  now: () => number;
  newVisitId: () => string;
  setTimer: (task: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** A request that must finish while the page is open: `done` is called when it is over (answered, failed or cut), whatever happened. */
  request: (body: string, done: () => void) => void;
  /** The last request, when the page is being hidden or closed. Returns false when the browser did not take it. */
  beacon: (body: string) => boolean;
}

export interface JourneyRecorder {
  /** Starts the recording of this page load; only the first call counts. `resumed` is true when the page opened again after a sign-in. */
  start(options: { eventId: string; resumed?: boolean }): void;
  /** Queues a record (dropped when the recording is not started, the name or key is not in the vocabulary, or the visit has sent enough). */
  record(name: JourneyName, key?: string | null): void;
  /** Like `record`, but only the first time in this visit for this name and key. */
  once(name: JourneyName, key?: string | null): void;
  /** The photo was saved (`ok`) or the save failed; the first saved photo of the visit also records how long the visit took. */
  saved(ok: boolean): void;
  /** Sends what is waiting now, with the browser's beacon (the page is being hidden or closed). */
  flushNow(): void;
  /** Whether the recording is running (for the page's own cleanup). */
  readonly running: boolean;
}

export function createJourneyRecorder(deps: JourneyDeps): JourneyRecorder {
  let eventId: string | null = null;
  let visit = '';
  let startedAt = 0;
  let queue: Tuple[] = [];
  let recorded = 0;
  let timer: unknown = null;
  let inFlight = false;
  let completed = false;
  const seen = new Set<string>();

  const body = (events: Tuple[]): string => JSON.stringify({ v: JOURNEY_VERSION, s: visit, e: eventId, ev: events });

  /** The records that go in one request: as many as fit the cap of records and of bytes. */
  const take = (): Tuple[] => {
    const batch: Tuple[] = [];
    while (queue.length > 0 && batch.length < JOURNEY_MAX_EVENTS) {
      batch.push(queue[0]);
      if (body(batch).length > JOURNEY_MAX_BYTES - 64) {
        batch.pop();
        break;
      }
      queue.shift();
    }
    if (batch.length === 0 && queue.length > 0) queue.shift();
    return batch;
  };

  const schedule = (): void => {
    if (timer !== null || queue.length === 0 || eventId === null) return;
    try {
      timer = deps.setTimer(() => {
        timer = null;
        send();
      }, FLUSH_DELAY_MS);
    } catch {
      timer = null;
    }
  };

  const send = (): void => {
    try {
      if (inFlight || queue.length === 0 || eventId === null) {
        // A request is still out: the records stay in the list and go when it is over.
        return;
      }
      const batch = take();
      if (batch.length === 0) return;
      inFlight = true;
      let finished = false;
      const done = (): void => {
        if (finished) return;
        finished = true;
        inFlight = false;
        schedule();
      };
      try {
        deps.request(body(batch), done);
      } catch {
        done();
      }
    } catch {
      inFlight = false;
    }
  };

  const record = (name: JourneyName, key?: string | null): void => {
    try {
      if (eventId === null || recorded >= MAX_RECORDS_PER_VISIT) return;
      if (!isJourneyName(name) || JOURNEY_VOCABULARY[name].from !== 'client') return;
      const keyed = key ?? NO_KEY;
      if (!isJourneyKey(name, keyed) && !(name === 'journey.start' && keyed === NO_KEY)) return;
      recorded += 1;
      queue.push([name, keyed === NO_KEY ? null : keyed, Math.max(0, Math.round(deps.now() - startedAt))]);
      schedule();
    } catch {
      // the recording must never affect the page
    }
  };

  const api: JourneyRecorder = {
    start({ eventId: id, resumed }) {
      try {
        if (!id || eventId === id) return;
        // Another event in the same page load (a client-side navigation): what waits for the old one goes out, and this is a new visit.
        if (eventId !== null) api.flushNow();
        eventId = id;
        visit = deps.newVisitId();
        startedAt = deps.now();
        queue = [];
        recorded = 0;
        completed = false;
        seen.clear();
        record(resumed ? 'journey.resume' : 'journey.start');
      } catch {
        eventId = null;
      }
    },
    record,
    once(name, key) {
      try {
        const id = `${name}\u0000${key ?? ''}`;
        if (seen.has(id)) return;
        seen.add(id);
        record(name, key);
      } catch {
        // see record
      }
    },
    saved(ok) {
      try {
        record('photo.save', ok ? 'ok' : 'failed');
        if (ok && !completed && eventId !== null) {
          completed = true;
          record('journey.complete', timeBucketOf(deps.now() - startedAt));
        }
      } catch {
        // see record
      }
    },
    flushNow() {
      try {
        if (timer !== null) {
          deps.clearTimer(timer);
          timer = null;
        }
        if (eventId === null || queue.length === 0) return;
        // The page is going: everything that is waiting goes in as few beacons as the caps allow, and a beacon the browser refuses falls back to the bounded request.
        while (queue.length > 0) {
          const batch = take();
          if (batch.length === 0) break;
          let taken = false;
          try {
            taken = deps.beacon(body(batch));
          } catch {
            taken = false;
          }
          if (!taken) {
            try {
              deps.request(body(batch), () => undefined);
            } catch {
              // lost, as a beacon may be
            }
          }
        }
      } catch {
        // see record
      }
    },
    get running() {
      return eventId !== null;
    },
  };
  return api;
}

// --- the real browser ---

function newVisitId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // fall through to the non-crypto fallback
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const browserDeps: JourneyDeps = {
  now: () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()),
  newVisitId,
  setTimer: (task, ms) => setTimeout(task, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  request: (body, done) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (): void => {
      if (timer !== null) clearTimeout(timer);
      done();
    };
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      timer = setTimeout(() => {
        try {
          controller?.abort();
        } catch {
          // already over
        }
        finish();
      }, REQUEST_TIMEOUT_MS);
      void fetch(JOURNEY_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, signal: controller?.signal }).then(finish, finish);
    } catch {
      finish();
    }
  },
  beacon: (body) => typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(JOURNEY_ENDPOINT, new Blob([body], { type: 'application/json' })),
};

/** The one recorder of the page. Does nothing until `start` is called, which the capture page does only when the event answer says `journeyRecording: true`. */
export const journey: JourneyRecorder = createJourneyRecorder(browserDeps);
