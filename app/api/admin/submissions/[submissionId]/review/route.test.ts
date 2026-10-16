import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';

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
  /** What the general level and the partner's level of the vocabulary hold in the database. */
  general?: { options: unknown[] };
  partner?: { annotationVocabulary: unknown };
}

function setup(t: TestContext, options: Options = {}) {
  const calls = { access: [] as Array<{ id: string; role: unknown }>, approve: [] as unknown[][], reject: [] as unknown[][], reopen: [] as unknown[][], retryEmail: [] as unknown[][] };
  const submission = options.submission === undefined ? { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'pending_review', peopleReview: { by: 'u1', at: '2026-10-10T10:00:00.000Z' } } : options.submission;
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => options.session ?? admin, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', {
    exports: {
      connectToDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async () => (name === COLLECTIONS.ADMIN_SETTINGS ? (options.general ?? null) : name === COLLECTIONS.PARTNERS ? (options.partner ?? null) : submission),
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
  t.mock.module('@/lib/email/submission-result-email', {
    exports: { resolveEventForSubmission: async () => (options.event === undefined ? { _id: eventId } : options.event) },
  });
  t.mock.module('@/lib/photo-vetting/review', {
    exports: {
      approvePhoto: async (...args: unknown[]) => (calls.approve.push(args), options.outcome ?? { ok: true, email: 'sent' }),
      rejectPhoto: async (...args: unknown[]) => (calls.reject.push(args), options.outcome ?? { ok: true, email: 'sent' }),
      returnPhotoToVetting: async (...args: unknown[]) => (calls.reopen.push(args), options.outcome ?? { ok: true, email: 'sent' }),
      retryApprovedPhotoEmail: async (...args: unknown[]) => (calls.retryEmail.push(args), 'sent'),
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
  assert.deepEqual(body.data, { submissionId: id, reviewStatus: 'approved', email: 'sent' });
  assert.deepEqual(calls.access, [{ id: eventId.toString(), role: 'manager' }]);
  assert.equal(calls.approve.length, 1);
  assert.deepEqual(calls.approve[0][2], { email: 'admin@example.com', id: 'u1' });
});

test('a manager returns a decided photo to vetting', async (t) => {
  const calls = setup(t, { session: manager, submission: { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'approved', photoReview: { photoUrl: null } } });
  const { POST } = await importRoute('return-to-vetting');
  const response = await POST(post({ action: 'return_to_vetting' }), params);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { data: Record<string, unknown> }).data, { submissionId: id, reviewStatus: 'pending_review', email: 'sent' });
  assert.equal(calls.reopen.length, 1);
  assert.deepEqual(calls.reopen[0][2], { email: 'manager@example.com', id: 'u2' });
});

test('an event manager can retry an approval email for an already-approved photo', async (t) => {
  const calls = setup(t, { session: manager, submission: { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'approved' } });
  const { POST } = await importRoute('retry-approval-email');
  const response = await POST(post({ action: 'retry_approval_email' }), params);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { data: Record<string, unknown> }).data, { submissionId: id, reviewStatus: 'approved', email: 'sent' });
  assert.equal(calls.retryEmail.length, 1);
  assert.equal((calls.retryEmail[0][1] as ObjectId).toString(), id);
  assert.deepEqual(calls.access, [{ id: eventId.toString(), role: 'manager' }]);
});

test('a rejection carries the moderator, a trimmed note cut to 500 characters and the reasons', async (t) => {
  const calls = setup(t, { session: manager });
  const { POST } = await importRoute('reject');
  const response = await POST(post({ action: 'reject', reasons: ['nudity'], reason: `  ${'x'.repeat(600)}  ` }), params);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { data: Record<string, unknown> }).data, { submissionId: id, reviewStatus: 'rejected', email: 'sent' });
  assert.deepEqual(calls.reject[0][2], { email: 'manager@example.com', id: 'u2' });
  assert.equal((calls.reject[0][3] as string).length, 500);
  assert.deepEqual(calls.reject[0][4], ['nudity']);
});

test('a rejection needs at least one reason (issue 628, owner answer 453): none, an empty list or the wrong type is a 400 and nothing is decided', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('reject-no-reason');
  for (const body of [{ action: 'reject' }, { action: 'reject', reasons: [] }, { action: 'reject', reasons: 'nudity' }, { action: 'reject', reasons: [1, null, ''] }, { action: 'reject', reason: 'a note alone is not a reason' }]) {
    const response = await POST(post(body), params);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match(String((await response.json() as { error?: string }).error), /at least one reason/);
  }
  assert.equal(calls.reject.length, 0);
});

test('a reason must be one the event offers now: an unknown key, a reason of another group and a reason the event hid are a 400 that names it', async (t) => {
  const hidden = { options: [{ group: 'reject_reason', key: 'alcohol', hidden: true }] };
  const calls = setup(t, { event: { _id: eventId, annotationVocabulary: hidden } });
  const { POST } = await importRoute('reject-bad-reason');
  for (const [reasons, named] of [[['nudity', 'bogus'], 'bogus'], [['happy'], 'happy'], [['alcohol'], 'alcohol']] as const) {
    const response = await POST(post({ action: 'reject', reasons }), params);
    assert.equal(response.status, 400, reasons.join());
    assert.match(String((await response.json() as { error?: string }).error), new RegExp(`not offered for this event: ${named}`));
  }
  assert.equal(calls.reject.length, 0);
});

test('a custom reason of the event, or of the general level, is accepted; reasons are stored once each, in the order of the list', async (t) => {
  const calls = setup(t, {
    event: { _id: eventId, annotationVocabulary: { options: [{ group: 'reject_reason', key: 'blocked_view', label: 'Blocks the view', custom: true }] } },
    general: { options: [{ group: 'reject_reason', key: 'late', label: 'Taken too late', custom: true }] },
  });
  const { POST } = await importRoute('reject-custom');
  const response = await POST(post({ action: 'reject', reasons: ['blocked_view', 'alcohol', 'late', 'alcohol'] }), params);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.reject[0][4], ['alcohol', 'late', 'blocked_view'], 'once each, standard options first as the list has them, then the custom ones');
});

test('an approval ignores the reasons: nothing is read or refused, and none reach the approval', async (t) => {
  const calls = setup(t);
  const { POST } = await importRoute('approve-with-reasons');
  assert.equal((await POST(post({ action: 'approve', reasons: ['bogus'] }), params)).status, 200);
  assert.equal(calls.approve.length, 1);
  assert.equal(calls.reject.length, 0);
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

test('marking the people comes first, for a rejection too (issue 542, answers 263, 267 and 453): a waiting photo nobody looked at is refused with a 409 and nothing is decided; looked at (also "nobody in it") it goes through', async (t) => {
  const calls = setup(t, { submission: { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'pending_review' } });
  const { POST } = await importRoute('unmarked');
  for (const action of ['approve', 'reject']) {
    const response = await POST(post({ action, reasons: ['nudity'] }), params);
    assert.equal(response.status, 409, action);
    assert.match(String((await response.json() as { error?: string }).error), /Mark the people/);
  }
  assert.equal(calls.approve.length + calls.reject.length, 0, 'nothing was decided');
});

test('the marking rule does not apply when the event turned marking off, or to a photo decided before (a rejected photo can be approved again)', async (t) => {
  const off = setup(t, { submission: { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'pending_review' }, event: { _id: eventId, markPeopleInVetting: false } });
  const { POST } = await importRoute('marking-off');
  assert.equal((await POST(post({ action: 'approve' }), params)).status, 200);
  assert.equal(off.approve.length, 1);
});

test('an event that does not mark people can reject without marks, but the reason is still required', async (t) => {
  const calls = setup(t, { submission: { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'pending_review' }, event: { _id: eventId, markPeopleInVetting: false } });
  const { POST } = await importRoute('marking-off-reject');
  assert.equal((await POST(post({ action: 'reject' }), params)).status, 400);
  assert.equal((await POST(post({ action: 'reject', reasons: ['poor_quality'] }), params)).status, 200);
  assert.deepEqual(calls.reject.map((call) => call[4]), [['poor_quality']]);
});

test('a rejected photo with no marks can be approved again', async (t) => {
  const calls = setup(t, { submission: { _id: new ObjectId(id), eventId: 'event-uuid', reviewStatus: 'rejected' } });
  const { POST } = await importRoute('re-approve');
  assert.equal((await POST(post({ action: 'approve' }), params)).status, 200);
  assert.equal(calls.approve.length, 1);
});
