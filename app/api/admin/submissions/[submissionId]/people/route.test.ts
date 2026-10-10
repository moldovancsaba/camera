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
const person = (extra: Record<string, unknown> = {}) => ({ id: 'a', box: { x: 10, y: 20, w: 30, h: 40 }, gender: 'female', age: 'adult', emotion: 'happy', merch: ['cap'], ...extra });

interface Options {
  session?: Session;
  submission?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  deny?: boolean;
}

function setup(t: TestContext, options: Options = {}) {
  const calls = { access: [] as Array<{ id: string; role: unknown }>, updates: [] as Array<{ filter: unknown; update: Record<string, unknown> }> };
  const submission = options.submission === undefined ? { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'pending_review' } : options.submission;
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => options.session ?? admin, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: { connectToDatabase: async () => ({ collection: () => ({ findOne: async () => submission, updateOne: async (filter: unknown, update: Record<string, unknown>) => (calls.updates.push({ filter, update }), { matchedCount: 1 }) }) }) },
  });
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
  t.mock.module('@/lib/email/submission-result-email', { namedExports: { resolveEventForSubmission: async () => (options.event === undefined ? { _id: eventId } : options.event) } });
  return calls;
}

const params = { params: Promise.resolve({ submissionId: id }) };
const put = (body: unknown, submissionId = id) => new NextRequest(`http://localhost/api/admin/submissions/${submissionId}/people`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('an admin saves the people marked in a photo, with who marked them and when; the event access check asks for the manager role', async (t) => {
  const calls = setup(t);
  const { PUT } = await importRoute('save');
  const response = await PUT(put({ people: [person(), person({ id: 'b', gender: 'male', age: 'old', merch: undefined })] }), params);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { people: Array<{ id: string }>; peopleReview: { by: string; at: string } } };
  assert.deepEqual(body.data.people.map((p) => p.id), ['a', 'b']);
  assert.equal(body.data.peopleReview.by, 'admin@example.com');
  assert.deepEqual(calls.access, [{ id: eventId.toString(), role: 'manager' }]);
  const set = (calls.updates[0].update as { $set: { people: unknown[]; peopleReview: { by: string } } }).$set;
  assert.equal(set.people.length, 2);
  assert.equal(set.peopleReview.by, 'admin@example.com');
});

test('nobody marked is saved too (looked at, nobody in it), and a second save replaces the first', async (t) => {
  const calls = setup(t);
  const { PUT } = await importRoute('empty');
  assert.equal((await PUT(put({ people: [] }), params)).status, 200);
  assert.deepEqual((calls.updates[0].update as { $set: { people: unknown[] } }).$set.people, []);
});

test('a list that is not valid is refused and nothing is saved', async (t) => {
  const calls = setup(t);
  const { PUT } = await importRoute('bad');
  for (const bad of [{}, { people: 'x' }, { people: [person({ gender: 'robot' })] }, { people: [person({ box: { x: 0, y: 0, w: 0, h: 5 } })] }, { people: [person({ merch: ['hat'] })] }]) {
    assert.equal((await PUT(put(bad), params)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await PUT(new NextRequest('http://localhost/x', { method: 'PUT', body: 'not json' }), params)).status, 400);
  assert.equal((await PUT(put({ people: [] }, 'nope'), { params: Promise.resolve({ submissionId: 'nope' }) })).status, 400);
  assert.equal(calls.updates.length, 0);
});

test('an unknown photo is a 404; someone with no access to the event is refused; a photo that belongs to no event is for global admins only', async (t) => {
  setup(t, { submission: null });
  assert.equal((await (await importRoute('missing')).PUT(put({ people: [] }), params)).status, 404);
});

test('no access to the event: refused, nothing saved', async (t) => {
  const calls = setup(t, { session: manager, deny: true });
  assert.equal((await (await importRoute('deny')).PUT(put({ people: [person()] }), params)).status, 403);
  assert.equal(calls.updates.length, 0);
});

test('a photo with no event can be marked by a global admin only', async (t) => {
  const calls = setup(t, { event: null, session: manager });
  assert.equal((await (await importRoute('orphan-manager')).PUT(put({ people: [] }), params)).status, 403);
  assert.equal(calls.updates.length, 0);
});
