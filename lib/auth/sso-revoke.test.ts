import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { revokeToken, SSO_REVOKE_TIMEOUT_MS } from './sso';

const realFetch = globalThis.fetch;
const realEnv = { base: process.env.SSO_BASE_URL, client: process.env.SSO_CLIENT_ID };

beforeEach(() => {
  process.env.SSO_BASE_URL = 'https://sso.example.test';
  process.env.SSO_CLIENT_ID = 'camera-test-client';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realEnv.base === undefined) delete process.env.SSO_BASE_URL;
  else process.env.SSO_BASE_URL = realEnv.base;
  if (realEnv.client === undefined) delete process.env.SSO_CLIENT_ID;
  else process.env.SSO_CLIENT_ID = realEnv.client;
});

// A peer that never answers: settles only when the request's own signal aborts.
function stubHangingFetch(): void {
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch;
}

test('revokeToken gives up when SSO never answers instead of hanging logout', async () => {
  stubHangingFetch();
  const started = Date.now();
  await assert.rejects(
    revokeToken('token-value', 'access_token', 20),
    (error: Error) => error.name === 'TimeoutError'
  );
  assert.ok(Date.now() - started < 1000, 'must reject near the 20 ms deadline, not hang');
});

test('revokeToken sends a live abort signal bounded by the default deadline', async () => {
  let seen: AbortSignal | null | undefined;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen = init?.signal;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  await revokeToken('token-value', 'refresh_token');
  assert.ok(seen instanceof AbortSignal);
  assert.equal(seen.aborted, false);
  assert.equal(SSO_REVOKE_TIMEOUT_MS, 3000);
});

test('revokeToken does not throw when SSO answers with an error status', async () => {
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;
  const originalError = console.error;
  console.error = () => {};
  try {
    await revokeToken('token-value', 'access_token');
  } finally {
    console.error = originalError;
  }
});
