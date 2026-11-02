import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const ADMIN = { appRole: 'admin', user: { id: 'admin-id', email: 'admin@example.com', name: 'Admin' } };

function setup(t: TestContext, submissions: Record<string, unknown>[]) {
  const seeded = fakeDb({ submissions });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAdmin: async () => ADMIN } });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  return seeded;
}

const request = (body: unknown) => new NextRequest('http://localhost/api/admin/users/merge', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function targetSubmission() {
  return {
    _id: 'real-1',
    userId: 'sso-real',
    userEmail: 'real@example.com',
    userName: 'Real User',
    createdAt: '2026-10-01T10:00:00.000Z',
  };
}

function pseudoSubmission(id: string) {
  return {
    _id: id,
    userId: 'anonymous',
    userEmail: 'pseudo@example.com',
    userName: 'Guest Name',
    userInfo: { name: 'Guest Name', email: 'pseudo@example.com', collectedAt: '2026-10-01T11:00:00.000Z' },
    createdAt: '2026-10-01T11:00:00.000Z',
  };
}

test('a retry finishes a partial merge case-insensitively and reports newly and previously linked photos', async (t) => {
  const seeded = setup(t, [
    targetSubmission(),
    pseudoSubmission('pseudo-1'),
    { ...pseudoSubmission('pseudo-2'), userInfo: { ...pseudoSubmission('pseudo-2').userInfo, mergedWith: 'sso-real', mergedAt: '2026-10-02T10:00:00.000Z' }, userId: 'sso-real', userEmail: 'real@example.com', userName: 'Real User' },
    pseudoSubmission('pseudo-3'),
  ]);
  const { POST } = await importRoute('partial-retry');
  const response = await POST(request({ pseudoEmail: 'PSEUDO@example.com', realUserEmail: 'REAL@example.com' }));
  assert.equal(response.status, 200);
  const data = await response.json() as { submissionsMerged: number; newlyLinked: number; alreadyLinked: number; message: string };
  assert.deepEqual([data.submissionsMerged, data.newlyLinked, data.alreadyLinked], [3, 2, 1]);
  assert.match(data.message, /Linked 2 photos to Real User/);
  const rows = seeded.data.submissions.filter((row) => row._id !== 'real-1');
  assert.ok(rows.every((row) => (row.userInfo as Record<string, unknown>).mergedWith === 'sso-real'));
  assert.ok(rows.every((row) => row.userId === 'sso-real' && row.userEmail === 'real@example.com'));
});

test('a retry is a successful no-op when every source photo already belongs to the selected account', async (t) => {
  const existing = { ...pseudoSubmission('pseudo-1'), userId: 'sso-real', userEmail: 'real@example.com', userName: 'Real User', userInfo: { ...pseudoSubmission('pseudo-1').userInfo, mergedWith: 'sso-real' } };
  setup(t, [targetSubmission(), existing]);
  const { POST } = await importRoute('already-complete');
  const response = await POST(request({ pseudoEmail: 'pseudo@example.com', realUserEmail: 'real@example.com' }));
  assert.equal(response.status, 200);
  const data = await response.json() as { submissionsMerged: number; newlyLinked: number; alreadyLinked: number; message: string };
  assert.deepEqual([data.submissionsMerged, data.newlyLinked, data.alreadyLinked], [1, 0, 1]);
  assert.match(data.message, /already linked/);
});

test('photos linked to a different account stop the merge without changing any source records', async (t) => {
  const conflict = { ...pseudoSubmission('pseudo-conflict'), userId: 'sso-other', userEmail: 'other@example.com', userInfo: { ...pseudoSubmission('pseudo-conflict').userInfo, mergedWith: 'sso-other' } };
  const pending = pseudoSubmission('pseudo-pending');
  const seeded = setup(t, [targetSubmission(), conflict, pending]);
  const { POST } = await importRoute('conflict');
  const response = await POST(request({ pseudoEmail: 'pseudo@example.com', realUserEmail: 'real@example.com' }));
  assert.equal(response.status, 409);
  assert.equal((await response.json() as { error: string }).error, 'Some photos are already linked to a different account. They were not changed.');
  assert.equal((seeded.data.submissions.find((row) => row._id === 'pseudo-pending')?.userId), 'anonymous');
});

test('a logged-in identity sharing the typed email is not captured as the pseudo merge source', async (t) => {
  const realContact = { ...pseudoSubmission('sso-contact'), userId: 'sso-other', userEmail: 'other@example.com' };
  const pseudo = pseudoSubmission('pseudo-1');
  const seeded = setup(t, [targetSubmission(), realContact, pseudo]);
  const { POST } = await importRoute('source-scope');
  const response = await POST(request({ pseudoEmail: 'pseudo@example.com', realUserEmail: 'real@example.com' }));
  assert.equal(response.status, 200);
  assert.equal(seeded.data.submissions.find((row) => row._id === 'sso-contact')?.userId, 'sso-other');
  assert.equal((seeded.data.submissions.find((row) => row._id === 'pseudo-1')?.userInfo as Record<string, unknown>).mergedWith, 'sso-real');
});

test('a destination without a matching signed-in SSO identity is rejected', async (t) => {
  setup(t, [pseudoSubmission('pseudo-1')]);
  const { POST } = await importRoute('no-target');
  assert.equal((await POST(request({ pseudoEmail: 'pseudo@example.com', realUserEmail: 'unknown@example.com' }))).status, 404);
});
