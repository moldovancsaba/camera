/**
 * Picture preloading for the slideshow player (camera#476, step S3). One preloader holds what the player needs and nothing more:
 *
 * - every load has a deadline, and a picture that is too slow is reported as failed to the caller but **keeps loading**; if it arrives
 *   later it becomes ready (no bytes thrown away on a slow link);
 * - at most `concurrency` loads run at a time, in the order they were asked for (the picture needed soonest first); an urgent load
 *   (the first pictures at start) skips the line; a hung load gives its place back after the deadline;
 * - the same address asked twice while loading is one load;
 * - a failed address is not tried again until `failTtlMs` has passed, so a dead link is not retried at every queue change;
 * - `prune` lets the player drop what it no longer needs, so memory does not grow for hours.
 *
 * The browser part (an `Image`) is injected as `load`, so this is unit-tested without a DOM.
 */

import { TimeoutError, withTimeout } from '@/lib/slideshow/resilience';

export interface PreloaderOptions<T> {
  /** Starts one load; resolves when the picture is ready, rejects when it cannot be loaded. */
  load: (url: string) => Promise<T>;
  /** Deadline for a caller and for the place in the line. */
  timeoutMs?: number;
  concurrency?: number;
  failTtlMs?: number;
  now?: () => number;
}

export type PreloadResult<T> = { ok: true; value: T; ms: number } | { ok: false; reason: 'error' | 'timeout'; ms: number };

export const PRELOAD_TIMEOUT_MS = 20_000;
export const PRELOAD_CONCURRENCY = 3;
export const PRELOAD_FAIL_TTL_MS = 120_000;

export function createPreloader<T>({ load, timeoutMs = PRELOAD_TIMEOUT_MS, concurrency = PRELOAD_CONCURRENCY, failTtlMs = PRELOAD_FAIL_TTL_MS, now = Date.now }: PreloaderOptions<T>) {
  const ready = new Map<string, T>();
  const failedUntil = new Map<string, number>();
  const loading = new Map<string, { started: Promise<void>; done: Promise<T> }>();
  const waiting: Array<() => void> = [];
  let running = 0;

  async function takePlace(): Promise<void> {
    if (running < concurrency) {
      running += 1;
      return;
    }
    // The one who frees a place hands it over, so `running` stays as it is.
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  function givePlace(): void {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }

  /** `started` resolves when the load has its place and begins; the deadline of a caller runs from there, not from the time spent in line. */
  function start(url: string, urgent: boolean): { started: Promise<void>; done: Promise<T> } {
    const existing = loading.get(url);
    if (existing) return existing;
    let begun!: () => void;
    const started = new Promise<void>((resolve) => (begun = resolve));
    const done = (async () => {
      let placeGiven = urgent;
      const giveOnce = () => {
        if (!placeGiven) {
          placeGiven = true;
          givePlace();
        }
      };
      if (!urgent) await takePlace();
      begun();
      // A load that hangs gives its place back after the deadline, so a few dead requests cannot stop all loading.
      const timer = setTimeout(giveOnce, timeoutMs);
      try {
        const value = await load(url);
        ready.set(url, value);
        failedUntil.delete(url);
        return value;
      } catch (error) {
        failedUntil.set(url, now() + failTtlMs);
        throw error;
      } finally {
        clearTimeout(timer);
        giveOnce();
        loading.delete(url);
      }
    })();
    done.catch(() => undefined);
    const entry = { started, done };
    loading.set(url, entry);
    return entry;
  }

  return {
    /** Loads one picture (or finds it ready, or finds it failed a short while ago) and says how it went, never throwing. */
    async preload(url: string, options: { urgent?: boolean } = {}): Promise<PreloadResult<T>> {
      const startedAt = now();
      const cached = ready.get(url);
      if (cached !== undefined) return { ok: true, value: cached, ms: 0 };
      const until = failedUntil.get(url);
      if (until !== undefined) {
        if (now() < until) return { ok: false, reason: 'error', ms: 0 };
        failedUntil.delete(url);
      }
      try {
        const entry = start(url, options.urgent === true);
        await entry.started;
        const value = await withTimeout(entry.done, timeoutMs);
        return { ok: true, value, ms: now() - startedAt };
      } catch (error) {
        return { ok: false, reason: error instanceof TimeoutError ? 'timeout' : 'error', ms: now() - startedAt };
      }
    },
    get: (url: string): T | undefined => ready.get(url),
    has: (url: string): boolean => ready.has(url),
    /** Forgets every ready picture that is not in `keep`. Loads in progress go on. */
    prune(keep: ReadonlySet<string>): void {
      for (const url of [...ready.keys()]) if (!keep.has(url)) ready.delete(url);
    },
    size: (): number => ready.size,
  };
}
