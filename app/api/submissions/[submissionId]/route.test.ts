import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';

const apiReal = await import('@/lib/api');

const submissionObjectId = new ObjectId();
const submissionId = submissionObjectId.toHexString();

type RouteModule = typeof import('./route');

// A fresh (uncached) query string per call so each test's mocks bind to their
// own import of route.ts (same pattern as tryon-results/[submissionId]/remove).
function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

function buildAdminSession(): Session {
  return {
    user: { id: 'admin-1', email: 'admin@example.com' },
    accessToken: 'token',
    refreshToken: 'refresh',
    accessTokenExpiresAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    appRole: 'admin',
    appAccess: true,
  } as Session;
}

function buildSubmission(finalized: boolean) {
  return {
    _id: submissionObjectId,
    submissionId: 'sub-1',
    userId: 'user-1',
    userEmail: 'user@example.com',
    frameId: 'frame-1',
    eventIds: [],
    originalImageUrl: 'https://example.com/original.jpg',
    finalImageUrl: 'https://example.com/final.jpg',
    consents: [],
    metadata: {},
    ...(finalized
      ? { userInfo: { name: 'First Writer', email: 'first@example.com', collectedAt: new Date().toISOString() } }
      : {}),
  };
}

function mockRouteDeps(
  t: import('node:test').TestContext,
  options: { finalized: boolean; session: Session | null },
  writes: Array<Record<string, unknown>>
) {
  t.mock.module('@/lib/api', {
    namedExports: { ...apiReal, optionalAuth: async () => options.session },
  });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: () => ({
          findOne: async () => buildSubmission(options.finalized),
          updateOne: async (_filter: unknown, update: Record<string, unknown>) => {
            writes.push(update);
            return { matchedCount: 1, modifiedCount: 1 };
          },
        }),
      }),
    },
  });
  t.mock.module('@/lib/email/submission-result-email', {
    namedExports: {
      dispatchPendingSubmissionEmailForSubmission: async () => null,
    },
  });
  // The "arrived" e-mail (epic 463) is its own module: here it has nothing to send.
  t.mock.module('@/lib/email/triggers', { namedExports: { dispatchArrivedEmail: async () => null } });
}

function buildPatch(): NextRequest {
  return new NextRequest(`http://localhost/api/submissions/${submissionId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'update_user_info', userInfo: { name: 'Fan Name', email: 'fan@example.com' } }),
  });
}

test('PATCH: first write on a non-finalized submission needs no session (public capture finalize)', async (t) => {
  const writes: Array<Record<string, unknown>> = [];
  mockRouteDeps(t, { finalized: false, session: null }, writes);

  const { PATCH } = await importRouteModule('first-write-anon');
  const res = await PATCH(buildPatch(), { params: Promise.resolve({ submissionId }) });

  assert.notEqual(res.status, 401);
  assert.notEqual(res.status, 403);
  assert.equal(res.status, 200);
  assert.equal(writes.length, 1);
});

test('PATCH: a finalized submission with no admin session is rejected with 403 and nothing is written', async (t) => {
  const writes: Array<Record<string, unknown>> = [];
  mockRouteDeps(t, { finalized: true, session: null }, writes);

  const { PATCH } = await importRouteModule('finalized-anon');
  const res = await PATCH(buildPatch(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 403);
  assert.equal(writes.length, 0);
});

test('PATCH: a finalized submission with an admin session is allowed', async (t) => {
  const writes: Array<Record<string, unknown>> = [];
  mockRouteDeps(t, { finalized: true, session: buildAdminSession() }, writes);

  const { PATCH } = await importRouteModule('finalized-admin');
  const res = await PATCH(buildPatch(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 200);
  assert.equal(writes.length, 1);
});

// --- DELETE -----------------------------------------------------------------
// WHAT: A try-on result is never hard-deleted through the generic route.
// WHY: Its derived document is the sync backstop's completion marker
//     (lib/tryon/sync.ts); deleting it without the admin remove route's
//     moderation event lets the next cron run re-create the result.

function buildUserSession(userId: string): Session {
  return { ...buildAdminSession(), user: { id: userId, email: 'user@example.com' }, appRole: 'none', appAccess: false } as Session;
}

function buildTryOnResult() {
  return {
    _id: submissionObjectId,
    submissionKind: 'tryon_result',
    userId: 'user-1',
    sourceSubmissionId: new ObjectId().toHexString(),
    sourceJobId: 'job_20260911182715_abcd1234',
    imageUrl: 'https://i.ibb.co/abc123/tryon-framed-1.png',
  };
}

function mockDeleteDeps(
  t: import('node:test').TestContext,
  options: { session: Session; submission: Record<string, unknown> },
  deletes: unknown[]
) {
  t.mock.module('@/lib/api', {
    namedExports: { ...apiReal, requireAuth: async () => options.session },
  });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: () => ({
          findOne: async () => options.submission,
          deleteOne: async (filter: unknown) => {
            deletes.push(filter);
            return { deletedCount: 1 };
          },
        }),
      }),
    },
  });
  t.mock.module('@/lib/email/submission-result-email', {
    namedExports: { dispatchPendingSubmissionEmailForSubmission: async () => null },
  });
  t.mock.module('@/lib/email/triggers', { namedExports: { dispatchArrivedEmail: async () => null } });
}

function buildDelete(): NextRequest {
  return new NextRequest(`http://localhost/api/submissions/${submissionId}`, { method: 'DELETE' });
}

test('DELETE: the owner of a try-on result gets 409 and nothing is deleted', async (t) => {
  const deletes: unknown[] = [];
  mockDeleteDeps(t, { session: buildUserSession('user-1'), submission: buildTryOnResult() }, deletes);

  const { DELETE } = await importRouteModule('delete-tryon-owner');
  const res = await DELETE(buildDelete(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /api\/admin\/tryon-results\/\[submissionId\]\/remove/);
  assert.equal(deletes.length, 0);
});

test('DELETE: an admin also gets 409 for a try-on result and nothing is deleted', async (t) => {
  const deletes: unknown[] = [];
  mockDeleteDeps(t, { session: buildAdminSession(), submission: buildTryOnResult() }, deletes);

  const { DELETE } = await importRouteModule('delete-tryon-admin');
  const res = await DELETE(buildDelete(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 409);
  assert.equal(deletes.length, 0);
});

test('DELETE: someone who does not own the try-on result still gets 403, not 409', async (t) => {
  const deletes: unknown[] = [];
  mockDeleteDeps(t, { session: buildUserSession('user-2'), submission: buildTryOnResult() }, deletes);

  const { DELETE } = await importRouteModule('delete-tryon-stranger');
  const res = await DELETE(buildDelete(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 403);
  assert.equal(deletes.length, 0);
});

test('DELETE: the owner can still delete their own photo submission', async (t) => {
  const deletes: unknown[] = [];
  mockDeleteDeps(t, { session: buildUserSession('user-1'), submission: buildSubmission(true) }, deletes);

  const { DELETE } = await importRouteModule('delete-photo-owner');
  const res = await DELETE(buildDelete(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 200);
  assert.equal(deletes.length, 1);
});

// camera#211: deleting a submission also deletes its stored files, files first.

test('DELETE: stored files are deleted before the row, and the response counts them', async (t) => {
  const deletes: unknown[] = [];
  let rowsDeletedWhenFilesWent = -1;
  mockDeleteDeps(t, { session: buildUserSession('user-1'), submission: buildSubmission(true) }, deletes);
  t.mock.module('@/lib/submissions/delete-files', {
    namedExports: {
      deleteSubmissionFiles: async () => {
        rowsDeletedWhenFilesWent = deletes.length;
        return { deleted: ['a', 'b'], keptShared: [], imgbbRequested: 1, imgbbFailed: 0 };
      },
    },
  });

  const { DELETE } = await importRouteModule('delete-files-first');
  const res = await DELETE(buildDelete(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 200);
  assert.equal(rowsDeletedWhenFilesWent, 0);
  assert.equal(deletes.length, 1);
  assert.deepEqual((await res.json()).data.files, { deleted: 2, keptShared: 0, imgbbRequested: 1, imgbbFailed: 0 });
});

test('DELETE: when the stored files cannot be deleted the answer is 502 and the row stays', async (t) => {
  const deletes: unknown[] = [];
  mockDeleteDeps(t, { session: buildUserSession('user-1'), submission: buildSubmission(true) }, deletes);
  t.mock.module('@/lib/submissions/delete-files', {
    namedExports: {
      deleteSubmissionFiles: async () => {
        throw apiReal.apiError('Could not delete the stored image files, so the submission was kept. Try again.', 502);
      },
    },
  });

  const { DELETE } = await importRouteModule('delete-files-fail');
  const res = await DELETE(buildDelete(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 502);
  assert.equal(deletes.length, 0);
});
