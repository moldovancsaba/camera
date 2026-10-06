import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';

const apiReal = await import('@/lib/api');
const authorizationReal = await import('@/lib/partners/authorization');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const id = new ObjectId().toHexString();
const eventId = new ObjectId();
const admin = { user: { id: 'u1', email: 'admin@example.com' }, appRole: 'admin', appAccess: true } as unknown as Session;
const manager = { user: { id: 'u2', email: 'manager@example.com' }, appRole: 'none', appAccess: true } as unknown as Session;

interface Options {
  session?: Session;
  submission?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  deny?: boolean;
  outcome?: Record<string, unknown>;
}

function setup(t: TestContext, options: Options = {}) {
  const calls = { access: [] as Array<{ id: string; role: unknown }>, approve: [] as unknown[][], reject: [] as unknown[][] };
  const submission = options.submission === undefined ? { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'pending_review' } : options.submission;
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => options.session ?? admin, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({ collection: () => ({ findOne: async () => submission }) }) } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      ...authorizationReal,
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _s: unknown, eventMongoId: string, role: unknown) => {
        calls.access.push({ id: eventMongoId, role });
        if (options.deny) throw apiReal.apiForbidden('No access to this event');
        return { role: 'manager', partnerId: 'p' };
      },
    },
  });
  t.mock.module('@/lib/email/submission-result-email', {
    namedExports: { resolveEventForSubmission: async () => (options.event === undefined ? { _id: eventId } : options.event) },
  });
  t.mock.module('@/lib/photo-vetting/review', {
    namedExports: {
      approvePhoto: async (...args: unknown[]) => (calls.approve.push(args), options.outcome ?? { ok: true, tryOn: null, email: 'sent' }),
      rejectPhoto: async (...args: unknown[]) => (calls.reject.push(args), options.outcome ?? { ok: true, email: 'sent' }),
    },
  });
  return calls;
}

const params = { params: Promise.resolve({ submissionId: id }) };
const post = (body: unknown, submissionId = id) =>
  new NextRequest(`http://localhost/api/admin/submissions/${submissionId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('an admin approves a photo; the event access check asks for the manager role', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('approve');
  const response = await POST(post({ action: 'approve' }), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Record<string, unknown> };
  assert.deepEqual(body.data, { submissionId: id, reviewStatus: 'approved', email: 'sent', tryOn: null });
  assert.deepEqual(calls.access, [{ id: eventId.toString(), role: 'manager' }]);
  assert.equal(calls.approve.length, 1);
  assert.deepEqual(calls.approve[0][2], { email: 'admin@example.com', id: 'u1' });
});

test('a rejection carries the moderator and a trimmed reason, cut to 500 characters', async (t) => {
  const calls = setup(t, { session: manager });
  const { POST } = await importRoute('reject');
  const response = await POST(post({ action: 'reject', reason: `  ${'x'.repeat(600)}  ` }), params);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { data: Record<string, unknown> }).data, { submissionId: id, reviewStatus: 'rejected', email: 'sent' });
  assert.deepEqual(calls.reject[0][2], { email: 'manager@example.com', id: 'u2' });
  assert.equal((calls.reject[0][3] as string).length, 500);
});

test('without access to the event nothing is decided', async (t) => {
  const calls = setup(t, { session: manager, deny: true });
  const { POST } = await importRoute('deny');
  assert.equal((await POST(post({ action: 'approve' }), params)).status, 403);
  assert.equal(calls.approve.length + calls.reject.length, 0);
});

test('a photo of no event can only be reviewed by a global admin', async (t) => {
  const calls = setup(t, { session: manager, event: null });
  const { POST } = await importRoute('no-event-manager');
  assert.equal((await POST(post({ action: 'approve' }), params)).status, 403);
  assert.equal(calls.approve.length, 0);
});

test('bad input is a 400, an unknown photo a 404, and neither decides anything', async (t) => {
  const calls = setup(t, { submission: null });
  const { POST } = await importRoute('bad-input');
  assert.equal((await POST(post({ action: 'publish' }), params)).status, 400);
  assert.equal((await POST(post({}), params)).status, 400);
  assert.equal((await POST(post({ action: 'approve' }, 'nope'), { params: Promise.resolve({ submissionId: 'nope' }) })).status, 400);
  assert.equal((await POST(post({ action: 'approve' }), params)).status, 404);
  assert.equal(calls.approve.length + calls.reject.length, 0);
});

test('a photo that was already decided is a 409 and a picture that could not be made a 502', async (t) => {
  setup(t, { outcome: { ok: false, reason: 'not_reviewable', message: 'Someone else already decided on this photo' } });
  const first = await (await importRoute('conflict')).POST(post({ action: 'approve' }), params);
  assert.equal(first.status, 409);
});

test('a picture that could not be made is a 502 and the message says the photo stays pending', async (t) => {
  setup(t, { outcome: { ok: false, reason: 'compose_failed', message: 'The picture could not be made; the photo stays pending. Try again in a moment.' } });
  const response = await (await importRoute('compose-failed')).POST(post({ action: 'approve' }), params);
  assert.equal(response.status, 502);
  assert.match(JSON.stringify(await response.json()), /stays pending/);
});
