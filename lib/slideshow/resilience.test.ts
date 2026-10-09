import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKOFF_MAX_MS, TimeoutError, fetchWithTimeout, nextBackoffMs, withTimeout } from './resilience';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('withTimeout gives the result, the error, or a TimeoutError', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
  await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 50), /boom/);
  await assert.rejects(withTimeout(new Promise(() => undefined), 20), TimeoutError);
});

test('fetchWithTimeout aborts a request that stalls and one whose body stalls, and passes a good answer', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: string, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    await assert.rejects(fetchWithTimeout('/x', {}, 20, (r) => r.json()), TimeoutError);

    globalThis.fetch = (async (_url: string, init?: RequestInit) => ({
      json: () => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    })) as unknown as typeof fetch;
    await assert.rejects(fetchWithTimeout('/x', {}, 20, (r) => r.json()), TimeoutError);

    globalThis.fetch = (async () => ({ json: async () => ({ ok: 1 }) })) as unknown as typeof fetch;
    assert.deepEqual(await fetchWithTimeout('/x', {}, 20, (r) => r.json()), { ok: 1 });

    globalThis.fetch = (async () => {
      throw new TypeError('offline');
    }) as typeof fetch;
    await assert.rejects(fetchWithTimeout('/x', {}, 20, (r) => r.json()), TypeError);
  } finally {
    globalThis.fetch = realFetch;
  }
  await sleep(1);
});

test('the backoff doubles from one second to fifteen and a good answer ends it', () => {
  let wait = 0;
  const seen: number[] = [];
  for (let i = 0; i < 7; i++) {
    wait = nextBackoffMs(wait, false);
    seen.push(wait);
  }
  assert.deepEqual(seen, [1000, 2000, 4000, 8000, BACKOFF_MAX_MS, BACKOFF_MAX_MS, BACKOFF_MAX_MS]);
  assert.equal(nextBackoffMs(8000, true), 0);
});
