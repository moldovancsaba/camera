import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { fetchFrameContext, PARTNER_PUSH_TIMEOUT_MS, pushPartnerToMessmass, pushSsoSessionToMessmass } from './messmassClient';

const realFetch = globalThis.fetch;
const realLog = console.log;
const realError = console.error;
const realEnv = { base: process.env.MESSMASS_BASE_URL, secret: process.env.CAMERA_MESSMASS_INTERNAL_SECRET };
const TOKENS = { access_token: 'a', refresh_token: 'r', expires_in: 3600 };

beforeEach(() => {
  process.env.MESSMASS_BASE_URL = 'https://messmass.example.test';
  process.env.CAMERA_MESSMASS_INTERNAL_SECRET = 'test-shared-secret';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
  console.error = realError;
  if (realEnv.base === undefined) delete process.env.MESSMASS_BASE_URL;
  else process.env.MESSMASS_BASE_URL = realEnv.base;
  if (realEnv.secret === undefined) delete process.env.CAMERA_MESSMASS_INTERNAL_SECRET;
  else process.env.CAMERA_MESSMASS_INTERNAL_SECRET = realEnv.secret;
});

test('pushSsoSessionToMessmass returns null when messmass never answers, so login is not held up', async () => {
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch;
  const started = Date.now();
  assert.equal(await pushSsoSessionToMessmass(TOKENS, 20), null);
  assert.ok(Date.now() - started < 1000, 'must give up near the 20 ms deadline, not hang');
});

test('pushSsoSessionToMessmass still returns the cookies messmass sets, with a live abort signal', async () => {
  let seen: AbortSignal | null | undefined;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen = init?.signal;
    return new Response(null, { status: 200, headers: { 'set-cookie': 'messmass_session=abc; Path=/' } });
  }) as typeof fetch;
  assert.deepEqual(await pushSsoSessionToMessmass(TOKENS), ['messmass_session=abc; Path=/']);
  assert.ok(seen instanceof AbortSignal);
  assert.equal(seen.aborted, false);
});

test('pushSsoSessionToMessmass returns null on a refusal such as 403', async () => {
  globalThis.fetch = (async () => new Response(null, { status: 403 })) as typeof fetch;
  assert.equal(await pushSsoSessionToMessmass(TOKENS), null);
});

test('pushSsoSessionToMessmass does nothing when messmass is not configured', async () => {
  delete process.env.MESSMASS_BASE_URL;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  assert.equal(await pushSsoSessionToMessmass(TOKENS), null);
  assert.equal(called, false);
});

const EVENT_ID = '66f1a2b3c4d5e6f708192a3b';

test('fetchFrameContext asks messmass for the event with the shared secret and returns its JSON', async () => {
  let url = '';
  let headers: Record<string, string> = {};
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    url = String(input);
    headers = (init?.headers ?? {}) as Record<string, string>;
    return Response.json({ success: true, event: { name: 'Fan Day' } });
  }) as typeof fetch;

  assert.deepEqual(await fetchFrameContext(EVENT_ID), { success: true, event: { name: 'Fan Day' } });
  assert.equal(url, `https://messmass.example.test/api/integrations/camera/events/${EVENT_ID}/frame-context`);
  assert.equal(headers['x-camera-secret'], 'test-shared-secret');
  assert.equal(headers.authorization, 'Bearer test-shared-secret');
});

test('fetchFrameContext is null for a refusal, a timeout, bad JSON, a malformed id or no configuration, and never throws', async () => {
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
  assert.equal(await fetchFrameContext(EVENT_ID), null);

  globalThis.fetch = (async () => new Response('not json', { status: 200 })) as typeof fetch;
  assert.equal(await fetchFrameContext(EVENT_ID), null);

  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))) as typeof fetch;
  assert.equal(await fetchFrameContext(EVENT_ID, 20), null);

  let called = false;
  globalThis.fetch = (async () => ((called = true), new Response('{}'))) as typeof fetch;
  assert.equal(await fetchFrameContext('../admin'), null);
  delete process.env.MESSMASS_BASE_URL;
  assert.equal(await fetchFrameContext(EVENT_ID), null);
  assert.equal(called, false);
});

// ---- Outcome log lines (issue 178) ----

/** Collects the structured lines the logger writes, parsed. */
function captureLogs(): Array<Record<string, unknown>> {
  const lines: Array<Record<string, unknown>> = [];
  console.log = (line: string) => void lines.push(JSON.parse(line));
  console.error = (line: string) => void lines.push(JSON.parse(line));
  return lines;
}
const outcomes = (lines: Array<Record<string, unknown>>) => lines.map((line) => [line.event, (line.context as Record<string, unknown>).outcome]);
const hangingFetch = (() =>
  new Promise((_resolve, reject) => void reject(new DOMException('timed out', 'TimeoutError')))) as unknown as typeof fetch;

test('the login push logs ok when messmass sends a session, and the line holds no token, cookie or secret', async () => {
  const lines = captureLogs();
  globalThis.fetch = (async () => new Response(null, { status: 200, headers: { 'set-cookie': 'messmass_session=cookie-value-1; Path=/' } })) as typeof fetch;
  assert.deepEqual(await pushSsoSessionToMessmass({ access_token: 'access-token-1', refresh_token: 'refresh-token-1', expires_in: 3600 }), ['messmass_session=cookie-value-1; Path=/']);
  assert.deepEqual(outcomes(lines), [['messmass.session_push', 'ok']]);
  assert.equal(lines[0].level, 'info');
  assert.equal((lines[0].context as Record<string, unknown>).status, 200);
  assert.equal(typeof (lines[0].context as Record<string, unknown>).durationMs, 'number');
  assert.ok(!JSON.stringify(lines).match(/access-token-1|refresh-token-1|cookie-value-1|test-shared-secret/));
});

test('the login push logs empty (a 2xx without a cookie), refused (403), timeout and failed apart, and always returns null', async () => {
  const lines = captureLogs();
  const tokens = { access_token: 'a', refresh_token: 'r', expires_in: 1 };
  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;
  assert.equal(await pushSsoSessionToMessmass(tokens), null);
  globalThis.fetch = (async () => new Response(null, { status: 403 })) as typeof fetch;
  assert.equal(await pushSsoSessionToMessmass(tokens), null);
  globalThis.fetch = hangingFetch;
  assert.equal(await pushSsoSessionToMessmass(tokens, 20), null);
  globalThis.fetch = (async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  }) as typeof fetch;
  assert.equal(await pushSsoSessionToMessmass(tokens), null);
  assert.deepEqual(outcomes(lines), [
    ['messmass.session_push', 'empty'],
    ['messmass.session_push', 'refused'],
    ['messmass.session_push', 'timeout'],
    ['messmass.session_push', 'failed'],
  ]);
  assert.equal((lines[1].context as Record<string, unknown>).status, 403);
  assert.equal((lines[3].context as Record<string, unknown>).code, 'ECONNREFUSED');
});

test('an unconfigured messmass writes no log line at all (nothing was attempted)', async () => {
  const lines = captureLogs();
  delete process.env.MESSMASS_BASE_URL;
  assert.equal(await pushSsoSessionToMessmass(TOKENS), null);
  assert.equal(await pushPartnerToMessmass({ cameraPartnerId: 'p1', name: 'Club' }), null);
  assert.deepEqual(lines, []);
});

const PARTNER = { cameraPartnerId: 'partner-1', name: 'Fan Club Name', logoUrl: 'https://img.example.test/logo.png' };

test('pushPartnerToMessmass still returns the id messmass gives, with a live abort signal and the longer default deadline', async () => {
  const lines = captureLogs();
  let seen: AbortSignal | null | undefined;
  let url = '';
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    url = String(input);
    seen = init?.signal;
    return Response.json({ partner: { id: 'messmass-partner-9' } });
  }) as typeof fetch;
  assert.deepEqual(await pushPartnerToMessmass(PARTNER), { id: 'messmass-partner-9' });
  assert.equal(url, 'https://messmass.example.test/api/integrations/camera/partners');
  assert.ok(seen instanceof AbortSignal);
  assert.equal(seen.aborted, false);
  assert.equal(PARTNER_PUSH_TIMEOUT_MS, 8000);
  assert.ok(PARTNER_PUSH_TIMEOUT_MS > 3000, 'more generous than the login push, which a user waits for on every login');
  assert.deepEqual(outcomes(lines), [['messmass.partner_push', 'ok']]);
  const context = lines[0].context as Record<string, unknown>;
  assert.equal(context.partnerId, 'partner-1');
  assert.equal(context.timeoutMs, 8000);
  assert.ok(!JSON.stringify(lines).match(/Fan Club Name|logo\.png|test-shared-secret/), 'no partner name, logo address or secret in the log');
});

test('pushPartnerToMessmass returns null when messmass never answers, so a partner save is not held up, and logs a timeout', async () => {
  const lines = captureLogs();
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))) as typeof fetch;
  const started = Date.now();
  assert.equal(await pushPartnerToMessmass(PARTNER, 20), null);
  assert.ok(Date.now() - started < 1000, 'must give up near the 20 ms deadline, not hang');
  assert.deepEqual(outcomes(lines), [['messmass.partner_push', 'timeout']]);
});

test('pushPartnerToMessmass returns null and logs refused for an error status, and failed for a network error', async () => {
  const lines = captureLogs();
  globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
  assert.equal(await pushPartnerToMessmass(PARTNER), null);
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  assert.equal(await pushPartnerToMessmass(PARTNER), null);
  assert.deepEqual(outcomes(lines), [['messmass.partner_push', 'refused'], ['messmass.partner_push', 'failed']]);
});
