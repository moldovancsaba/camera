import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { pushSsoSessionToMessmass } from './messmassClient';

const realFetch = globalThis.fetch;
const realEnv = { base: process.env.MESSMASS_BASE_URL, secret: process.env.CAMERA_MESSMASS_INTERNAL_SECRET };
const TOKENS = { access_token: 'a', refresh_token: 'r', expires_in: 3600 };

beforeEach(() => {
  process.env.MESSMASS_BASE_URL = 'https://messmass.example.test';
  process.env.CAMERA_MESSMASS_INTERNAL_SECRET = 'test-shared-secret';
});

afterEach(() => {
  globalThis.fetch = realFetch;
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
