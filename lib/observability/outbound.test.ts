import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchBounded, isTimeoutError, logOutbound, OutboundTimeoutError } from './outbound';

const realFetch = globalThis.fetch;
const realLog = console.log;
const realError = console.error;

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
  console.error = realError;
});

/** Collects the structured lines the logger writes, parsed. */
function captureLogs(): Array<Record<string, unknown>> {
  const lines: Array<Record<string, unknown>> = [];
  console.log = (line: string) => void lines.push(JSON.parse(line));
  console.error = (line: string) => void lines.push(JSON.parse(line));
  return lines;
}

function hangingFetch(): void {
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch;
}

test('fetchBounded gives up on a peer that never answers, with a clear TimeoutError, and logs one timeout line', async () => {
  const lines = captureLogs();
  hangingFetch();
  const started = Date.now();
  await assert.rejects(
    fetchBounded('test.call', 'the test call', 'https://peer.example.test/path?secret=hunter2', {}, 20),
    (error: unknown) => error instanceof OutboundTimeoutError && error.name === 'TimeoutError' && /the test call did not answer within 20 ms/.test(error.message),
  );
  assert.ok(Date.now() - started < 1000, 'must reject near the 20 ms deadline');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, 'warn');
  assert.equal(lines[0].event, 'test.call');
  assert.equal((lines[0].context as Record<string, unknown>).outcome, 'timeout');
  assert.equal((lines[0].context as Record<string, unknown>).timeoutMs, 20);
  assert.ok(!JSON.stringify(lines[0]).includes('hunter2'), 'the address with its query is never logged');
});

test('fetchBounded rethrows a network failure unchanged and logs a failed line with a short code only', async () => {
  const lines = captureLogs();
  const failure = Object.assign(new TypeError('fetch failed for https://peer.example.test/?token=abc'), { cause: { code: 'ECONNREFUSED' } });
  globalThis.fetch = (async () => {
    throw failure;
  }) as typeof fetch;
  await assert.rejects(fetchBounded('test.call', 'the test call', 'https://peer.example.test/', {}, 1000), (error: unknown) => error === failure);
  assert.equal(lines.length, 1);
  const context = lines[0].context as Record<string, unknown>;
  assert.equal(context.outcome, 'failed');
  assert.equal(context.errorName, 'TypeError');
  assert.equal(context.code, 'ECONNREFUSED');
  assert.ok(!JSON.stringify(lines[0]).includes('abc'), 'the error message (it can hold an address) is never logged');
});

test('fetchBounded returns the response of any status and passes a live abort signal; the caller logs ok or refused', async () => {
  const lines = captureLogs();
  let seen: AbortSignal | null | undefined;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen = init?.signal;
    return new Response(null, { status: 503 });
  }) as typeof fetch;
  const response = await fetchBounded('test.call', 'the test call', 'https://peer.example.test/', { method: 'POST' }, 1000);
  assert.equal(response.status, 503);
  assert.ok(seen instanceof AbortSignal);
  assert.equal(seen.aborted, false);
  assert.deepEqual(lines, []);
});

test('logOutbound writes ok at info and every other outcome at warn, as one JSON line each', () => {
  const lines = captureLogs();
  logOutbound('test.call', 'ok', { status: 200, durationMs: 12 });
  logOutbound('test.call', 'refused', { status: 403 });
  logOutbound('test.call', 'empty', { status: 200 });
  assert.deepEqual(
    lines.map((line) => [line.level, (line.context as Record<string, unknown>).outcome]),
    [['info', 'ok'], ['warn', 'refused'], ['warn', 'empty']],
  );
});

test('isTimeoutError recognises the abort-signal timeout and our wrapper, and nothing else', () => {
  assert.equal(isTimeoutError(new DOMException('x', 'TimeoutError')), true);
  assert.equal(isTimeoutError(new OutboundTimeoutError('c', 5)), true);
  assert.equal(isTimeoutError(new DOMException('x', 'AbortError')), true);
  assert.equal(isTimeoutError(new TypeError('fetch failed')), false);
  assert.equal(isTimeoutError('TimeoutError'), false);
  assert.equal(isTimeoutError(null), false);
});
