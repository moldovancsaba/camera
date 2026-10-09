/**
 * Bounded waits for the slideshow player (camera#476, step S3): every request and every picture load gets a deadline, so one stalled
 * request can no longer hold the player still. Pure and DOM-free (it only needs `fetch` and timers), so it is unit-tested.
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/** The promise's own result, or a TimeoutError after `ms`. The timer is cleared when the promise settles; the promise itself keeps running. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * One request with a deadline that also covers reading the answer: the request is aborted after `ms`, whether it stalls before the
 * first byte or in the middle of the body. `read` turns the response into the result (for example `(r) => r.json()`).
 */
export async function fetchWithTimeout<T>(url: string, init: RequestInit, ms: number, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await read(await fetch(url, { ...init, signal: controller.signal }));
  } catch (error) {
    if (controller.signal.aborted) throw new TimeoutError(ms);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const BACKOFF_FIRST_MS = 1000;
export const BACKOFF_MAX_MS = 15_000;

/** How long to wait before the next refill after a failed one: 1, 2, 4, 8 s, then 15 s. A good answer ends the waiting. */
export function nextBackoffMs(previousMs: number, ok: boolean): number {
  if (ok) return 0;
  return Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_FIRST_MS, previousMs * 2));
}
