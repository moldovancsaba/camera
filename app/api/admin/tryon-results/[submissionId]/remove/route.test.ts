import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { SubmissionMethod, SubmissionStatus, type Submission } from '@/lib/db/schemas';
import type { Session } from '@/lib/auth/session';

const apiReal = await import('@/lib/api');
const auditReal = await import('@/lib/tryon/moderation-audit');

const submissionObjectId = new ObjectId();
const submissionId = submissionObjectId.toHexString();

function buildSession(): Session {
  return {
    user: { id: 'admin-1', email: 'admin@example.com' },
    accessToken: 'token',
    refreshToken: 'refresh',
    accessTokenExpiresAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    appRole: 'admin',
    appAccess: true,
  };
}

function buildResultSubmission(): Submission {
  return {
    _id: submissionObjectId,
    submissionId: 'source-sub-1',
    userId: 'user-1',
    userEmail: 'user@example.com',
    frameId: 'frame-1',
    partnerId: null,
    partnerName: null,
    eventIds: [],
    eventName: null,
    originalImageUrl: 'https://example.com/original.jpg',
    finalImageUrl: 'https://example.com/final.jpg',
    submissionKind: 'tryon_result',
    reviewStatus: 'approved',
    isShareVisible: true,
    isSlideshowEligible: true,
    method: SubmissionMethod.FILE_UPLOAD,
    status: SubmissionStatus.COMPLETED,
    consents: [],
    metadata: {
      deviceType: 'desktop',
      originalWidth: 100,
      originalHeight: 100,
    },
  } as unknown as Submission;
}

function buildFakeDb(deleteOneResult: { deletedCount: number }, calls: string[]) {
  return {
    collection: () => ({
      findOne: async () => buildResultSubmission(),
      deleteOne: async () => {
        calls.push('deleteOne');
        return deleteOneResult;
      },
    }),
  };
}

function mockRouteDeps(
  t: import('node:test').TestContext,
  deleteOneResult: { deletedCount: number },
  calls: string[],
  appendCalls: unknown[][]
) {
  t.mock.module('@/lib/api', {
    namedExports: { ...apiReal, requireAuth: async () => buildSession() },
  });
  t.mock.module('@/lib/tryon/moderation-audit', {
    namedExports: {
      ...auditReal,
      appendTryOnModerationEvent: async (...args: unknown[]) => {
        calls.push('appendTryOnModerationEvent');
        appendCalls.push(args);
        return {} as never;
      },
    },
  });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: { connectToDatabase: async () => buildFakeDb(deleteOneResult, calls) },
  });
}

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/tryon-results/x/remove', { method: 'POST' });
}

type RouteModule = typeof import('./route');

// A fresh (uncached) query string per call so each test's mocks above bind to
// their own import of route.ts, instead of all tests sharing whichever mocks
// were active the first time the module happened to load.
function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

test('deleteOne failure (deletedCount: 0) never writes the moderation audit event', async (t) => {
  const calls: string[] = [];
  const appendCalls: unknown[][] = [];
  mockRouteDeps(t, { deletedCount: 0 }, calls, appendCalls);

  const { POST } = await importRouteModule('delete-fails');
  const res = await POST(buildRequest(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 500);
  assert.deepEqual(calls, ['deleteOne']);
  assert.equal(appendCalls.length, 0);
});

test('deleteOne success (deletedCount: 1) writes the audit event exactly once, after the delete, with the expected payload', async (t) => {
  const calls: string[] = [];
  const appendCalls: unknown[][] = [];
  mockRouteDeps(t, { deletedCount: 1 }, calls, appendCalls);

  const { POST } = await importRouteModule('delete-succeeds');
  const res = await POST(buildRequest(), { params: Promise.resolve({ submissionId }) });

  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['deleteOne', 'appendTryOnModerationEvent']);
  assert.equal(appendCalls.length, 1);

  const [, payload] = appendCalls[0] as [unknown, Record<string, unknown>];
  const resultSubmission = buildResultSubmission();
  assert.deepEqual(payload, {
    resultSubmissionId: submissionId,
    resultSubmission,
    action: 'remove',
    actorEmail: 'admin@example.com',
    nextState: auditReal.snapshotTryOnModerationState(resultSubmission, {
      reviewStatus: 'rejected',
      archiveBucket: 'rejected',
      archived: true,
      shareVisible: false,
      slideshowEligible: false,
      isGreat: false,
      isService: false,
    }),
    reason: 'Permanently removed by admin',
  });
});
