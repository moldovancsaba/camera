import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { exchangeCodeForToken, getUserInfo, revokeToken, SSO_TOKEN_EXCHANGE_TIMEOUT_MS, SSO_USERINFO_TIMEOUT_MS } from './sso';

const realFetch = globalThis.fetch;
const realLog = console.log;
const realError = console.error;
const realEnv = { base: process.env.SSO_BASE_URL, client: process.env.SSO_CLIENT_ID };

beforeEach(() => {
  process.env.SSO_BASE_URL = 'https://sso.example.test';
  process.env.SSO_CLIENT_ID = 'camera-test-client';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
  console.error = realError;
  if (realEnv.base === undefined) delete process.env.SSO_BASE_URL;
  else process.env.SSO_BASE_URL = realEnv.base;
  if (realEnv.client === undefined) delete process.env.SSO_CLIENT_ID;
  else process.env.SSO_CLIENT_ID = realEnv.client;
});

function captureLogs(): Array<Record<string, unknown>> {
  const lines: Array<Record<string, unknown>> = [];
  console.log = (line: string) => void lines.push(JSON.parse(line));
  console.error = (line: string) => void lines.push(JSON.parse(line));
  return lines;
}

// A peer that never answers: settles only when the request's own signal aborts.
function stubHangingFetch(): void {
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch;
}

const outcomeOf = (line: Record<string, unknown>) => (line.context as Record<string, unknown>).outcome;

test('the token exchange gives up when SSO never answers, with an error that names the call, and logs a timeout', async () => {
  const lines = captureLogs();
  stubHangingFetch();
  const started = Date.now();
  await assert.rejects(
    exchangeCodeForToken('auth-code-123', 'https://camera.example.test/api/auth/callback', 'verifier-xyz', 20),
    (error: Error) => error.name === 'TimeoutError' && /SSO token exchange did not answer within 20 ms/.test(error.message),
  );
  assert.ok(Date.now() - started < 1000, 'must reject near the 20 ms deadline, not hang');
  assert.deepEqual(lines.map((line) => [line.event, outcomeOf(line)]), [['sso.token_exchange', 'timeout']]);
  assert.ok(!JSON.stringify(lines).match(/auth-code-123|verifier-xyz/), 'neither the code nor the verifier is logged');
});

test('the token exchange on success returns the tokens as before, sends a live abort signal, and logs ok without any token', async () => {
  const lines = captureLogs();
  let seen: AbortSignal | null | undefined;
  let sentBody = '';
  const tokens = { access_token: 'access-secret-1', refresh_token: 'refresh-secret-1', id_token: 'a.b.c', expires_in: 3600, token_type: 'Bearer', scope: 'openid' };
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen = init?.signal;
    sentBody = String(init?.body);
    return Response.json(tokens);
  }) as typeof fetch;
  const result = await exchangeCodeForToken('auth-code-123', 'https://camera.example.test/api/auth/callback', 'verifier-xyz');
  assert.deepEqual(result, tokens);
  assert.ok(seen instanceof AbortSignal);
  assert.equal(seen.aborted, false);
  assert.match(sentBody, /grant_type=authorization_code/);
  assert.match(sentBody, /code_verifier=verifier-xyz/);
  assert.equal(SSO_TOKEN_EXCHANGE_TIMEOUT_MS, 10_000);
  assert.deepEqual(lines.map((line) => [line.event, outcomeOf(line)]), [['sso.token_exchange', 'ok']]);
  assert.ok(!JSON.stringify(lines).match(/secret-1|auth-code-123|verifier-xyz/), 'no token, code or verifier in the log');
});

test('the token exchange keeps its refusal error (status and body) and logs only the status', async () => {
  const lines = captureLogs();
  globalThis.fetch = (async () => new Response('invalid_grant: code already used', { status: 400 })) as typeof fetch;
  await assert.rejects(exchangeCodeForToken('c', 'https://camera.example.test/cb', 'v'), /Token exchange failed: 400 invalid_grant: code already used/);
  assert.deepEqual(lines.map((line) => [line.event, outcomeOf(line)]), [['sso.token_exchange', 'refused']]);
  assert.equal((lines[0].context as Record<string, unknown>).status, 400);
  assert.ok(!JSON.stringify(lines).includes('already used'), 'the body of the refusal is not logged');
});

test('userinfo gives up when SSO never answers and logs a timeout', async () => {
  const lines = captureLogs();
  stubHangingFetch();
  await assert.rejects(getUserInfo('access-secret-2', 20), (error: Error) => error.name === 'TimeoutError' && /SSO userinfo did not answer within 20 ms/.test(error.message));
  assert.deepEqual(lines.map((line) => [line.event, outcomeOf(line)]), [['sso.userinfo', 'timeout']]);
  assert.ok(!JSON.stringify(lines).includes('access-secret-2'));
});

test('userinfo on success returns the same profile as before with a live abort signal, and logs ok without the person', async () => {
  const lines = captureLogs();
  let seen: AbortSignal | null | undefined;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen = init?.signal;
    return Response.json({ sub: 'user-1', email: 'person@example.test', name: 'Pat Example', email_verified: true, role: 'user' });
  }) as typeof fetch;
  const user = await getUserInfo('access-secret-2');
  assert.deepEqual(user, { id: 'user-1', email: 'person@example.test', name: 'Pat Example', email_verified: true, role: 'user' });
  assert.ok(seen instanceof AbortSignal);
  assert.equal(seen.aborted, false);
  assert.equal(SSO_USERINFO_TIMEOUT_MS, 5000);
  assert.deepEqual(lines.map((line) => [line.event, outcomeOf(line)]), [['sso.userinfo', 'ok']]);
  assert.ok(!JSON.stringify(lines).match(/person@example|Pat Example|user-1|access-secret-2/), 'no e-mail, name, id or token in the log');
});

test('userinfo keeps its refusal error and logs refused', async () => {
  const lines = captureLogs();
  globalThis.fetch = (async () => new Response('nope', { status: 401 })) as typeof fetch;
  await assert.rejects(getUserInfo('t'), /Failed to get user info: 401 nope/);
  assert.deepEqual(lines.map((line) => [line.event, outcomeOf(line)]), [['sso.userinfo', 'refused']]);
});

test('the token revoke logs its outcome, with the kind of token and never the token', async () => {
  const lines = captureLogs();
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;
  await revokeToken('refresh-secret-3', 'refresh_token');
  stubHangingFetch();
  await assert.rejects(revokeToken('access-secret-3', 'access_token', 20), (error: Error) => error.name === 'TimeoutError');
  assert.deepEqual(lines.map((line) => [line.event, outcomeOf(line)]), [['sso.token_revoke', 'refused'], ['sso.token_revoke', 'timeout']]);
  assert.equal((lines[0].context as Record<string, unknown>).tokenType, 'refresh_token');
  assert.ok(!JSON.stringify(lines).match(/secret-3/));
});
