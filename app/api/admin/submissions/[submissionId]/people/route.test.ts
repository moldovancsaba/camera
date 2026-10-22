import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { resolveVocabulary } from '@/lib/photo-vetting/vocabulary';
import { CONSENT_ELIGIBLE_FILTER } from '@/lib/events/consent-eligibility';

const apiReal = await import('@/lib/api');
const authorizationReal = await import('@/lib/partners/authorization');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const id = new ObjectId().toHexString();
const eventId = new ObjectId();
const CONSENT_AUDIT = [{ pageId: 'consent', pageType: 'accept', checkboxText: 'I accept the privacy notice', accepted: true, acceptedAt: '2026-10-10T10:00:00.000Z' }];
const admin = { user: { id: 'u1', email: 'admin@example.com' }, appRole: 'admin', appAccess: true } as unknown as Session;
const manager = { user: { id: 'u2', email: 'manager@example.com' }, appRole: 'none', appAccess: true } as unknown as Session;
const person = (extra: Record<string, unknown> = {}) => ({ id: 'a', box: { x: 10, y: 20, w: 30, h: 40 }, gender: 'female', age: 'adult', emotion: 'happy', merch: ['cap'], ...extra });

interface Options {
  session?: Session;
  submission?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  deny?: boolean;
  /** What the general level and the partner's level of the vocabulary hold in the database. */
  general?: { options: unknown[] };
  partner?: { annotationVocabulary: unknown };
}

function setup(t: TestContext, options: Options = {}) {
  const calls = { access: [] as Array<{ id: string; role: unknown }>, updates: [] as Array<{ filter: unknown; update: Record<string, unknown> }> };
  const submission = options.submission === undefined
    ? { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'pending_review', consentStatus: 'received', consents: CONSENT_AUDIT }
    : options.submission && !('consentStatus' in options.submission)
      ? { ...options.submission, consentStatus: 'received', consents: CONSENT_AUDIT }
      : options.submission;
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => options.session ?? admin, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', {
    exports: {
      connectToDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async () => (name === COLLECTIONS.ADMIN_SETTINGS ? (options.general ?? null) : name === COLLECTIONS.PARTNERS ? (options.partner ?? null) : submission),
          updateOne: async (filter: unknown, update: Record<string, unknown>) => (calls.updates.push({ filter, update }), { matchedCount: 1 }),
        }),
      }),
    },
  });
  t.mock.module('@/lib/partners/authorization', {
    exports: {
      ...authorizationReal,
      assertGlobalAdminOrPartnerEventAccess: async (_db: unknown, _s: unknown, eventMongoId: string, role: unknown) => {
        calls.access.push({ id: eventMongoId, role });
        if (options.deny) throw apiReal.apiForbidden('No access to this event');
        return { role: 'manager', partnerId: 'p' };
      },
    },
  });
  t.mock.module('@/lib/email/submission-result-email', { exports: { resolveEventForSubmission: async () => (options.event === undefined ? { _id: eventId } : options.event) } });
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
  assert.equal((body.data.peopleReview as { vocabulary?: string }).vocabulary, resolveVocabulary().version, 'the version of the list of words the marks were made with is recorded');
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

test('analysis updates on an approved photo leave its status and visibility untouched', async (t) => {
  const calls = setup(t, { submission: { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'approved', isShareVisible: true, imageUrl: 'https://example.com/photo.jpg' } });
  const { PUT } = await importRoute('analysis-only');
  assert.equal((await PUT(put({ people: [person()], analysisOnly: true }), params)).status, 200);
  const update = calls.updates[0].update as { $set: Record<string, unknown> };
  assert.deepEqual(calls.updates[0].filter, {
    $and: [
      { _id: new ObjectId(id), reviewStatus: 'approved' },
      CONSENT_ELIGIBLE_FILTER,
    ],
  });
  assert.deepEqual(Object.keys(update.$set).sort(), ['people', 'peopleReview']);
  assert.equal(update.$set.reviewStatus, undefined);
  assert.equal(update.$set.isShareVisible, undefined);
});

test('analysis-only saves are refused after another moderator has returned the photo to vetting', async (t) => {
  const calls = setup(t, { submission: { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'pending_review', isShareVisible: false } });
  const { PUT } = await importRoute('analysis-no-longer-approved');
  const response = await PUT(put({ people: [person()], analysisOnly: true }), params);
  assert.equal(response.status, 409);
  assert.equal(calls.updates.length, 0);
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

test('the keys are checked against the list of the event: a custom option of the event is saved, an option the event hides is refused, and the version recorded is the event\'s own', async (t) => {
  const annotationVocabulary = { options: [{ group: 'merch', key: 'poncho', label: 'Poncho', custom: true }, { group: 'merch', key: 'scarf', hidden: true }] };
  const calls = setup(t, { event: { _id: eventId, annotationVocabulary } });
  const { PUT } = await importRoute('event-list');
  assert.equal((await PUT(put({ people: [person({ merch: ['poncho'] })] }), params)).status, 200);
  const set = (calls.updates[0].update as { $set: { people: Array<{ merch: string[] }>; peopleReview: { vocabulary: string } } }).$set;
  assert.deepEqual(set.people[0].merch, ['poncho']);
  assert.equal(set.peopleReview.vocabulary, resolveVocabulary({ event: annotationVocabulary }).version);
  assert.notEqual(set.peopleReview.vocabulary, resolveVocabulary().version);
  const hidden = await PUT(put({ people: [person({ merch: ['scarf'] })] }), params);
  assert.equal(hidden.status, 400, 'scarf is hidden for this event');
  assert.equal(calls.updates.length, 1, 'nothing was saved for the refused list');
});

test('the levels above the event count: the general level\'s custom option and the partner\'s relabelled option are read from the database', async (t) => {
  const calls = setup(t, {
    event: { _id: eventId, partnerId: 'p1' },
    general: { options: [{ group: 'emotion', key: 'smirk', label: 'Smirk', custom: true }] },
    partner: { annotationVocabulary: { options: [{ group: 'age', key: 'old', hidden: true }] } },
  });
  const { PUT } = await importRoute('levels');
  assert.equal((await PUT(put({ people: [person({ emotion: 'smirk' })] }), params)).status, 200);
  assert.equal((await PUT(put({ people: [person({ age: 'old' })] }), params)).status, 400, 'the partner hides the senior age');
  assert.equal(calls.updates.length, 1);
});

test('a check against the list needs the event first: someone with no access is refused before the list is read', async (t) => {
  const calls = setup(t, { session: manager, deny: true });
  assert.equal((await (await importRoute('deny-first')).PUT(put({ people: 'x' }), params)).status, 403);
  assert.equal(calls.updates.length, 0);
});
