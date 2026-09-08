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
