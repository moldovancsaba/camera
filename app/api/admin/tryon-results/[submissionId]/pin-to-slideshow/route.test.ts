import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess } from '@/lib/api/responses';
import { withErrorHandler } from '@/lib/api/withErrorHandler';
import { COLLECTIONS } from '@/lib/db/schemas';

const fakeSession = { appRole: 'admin', user: { email: 'admin@example.com' } };

mock.module('@/lib/api', {
  namedExports: { requireAuth: async () => fakeSession, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler },
});
mock.module('@/lib/partners/authorization', {
  namedExports: { isGlobalAdminSession: () => true },
});

type UpdateResult = { matchedCount: number };

let slideshowFindOneResult: Record<string, unknown> | null;
let updateOneResult: UpdateResult;
let updateOneCalls: Array<{ filter: unknown; update: unknown }>;

mock.module('@/lib/db/mongodb', {
  namedExports: {
    connectToDatabase: async () => ({
      collection(name: string) {
        if (name === COLLECTIONS.SUBMISSIONS) {
          return {
            findOne: async () => ({ _id: new ObjectId(submissionId), submissionKind: 'tryon_result' }),
          };
        }
        if (name === COLLECTIONS.SLIDESHOWS) {
          return {
            findOne: async () => slideshowFindOneResult,
            updateOne: async (filter: unknown, update: unknown) => {
              updateOneCalls.push({ filter, update });
              return updateOneResult;
            },
          };
        }
        throw new Error(`Unexpected collection requested in test: ${name}`);
      },
    }),
  },
});

const { POST } = await import('./route');

const submissionId = new ObjectId().toHexString();
const slideshowId = 'slideshow-under-test';

function buildRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function buildContext() {
  return { params: Promise.resolve({ submissionId }) };
}

test('pin against an existing slideshow succeeds', async () => {
  slideshowFindOneResult = { slideshowId };
  updateOneResult = { matchedCount: 1 };
  updateOneCalls = [];

  const response = await POST(buildRequest({ slideshowId, pin: true }), buildContext());
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.deepEqual(json.data, { submissionId, slideshowId, pinned: true });
  assert.equal(updateOneCalls.length, 1);
});

test('pin against a slideshow deleted just before the write throws instead of apiSuccess', async () => {
  slideshowFindOneResult = { slideshowId };
  updateOneResult = { matchedCount: 0 };
  updateOneCalls = [];

  const response = await POST(buildRequest({ slideshowId, pin: true }), buildContext());
  assert.equal(response.status, 404);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.equal(updateOneCalls.length, 1);
});

test('unpin against an existing slideshow succeeds', async () => {
  slideshowFindOneResult = { slideshowId };
  updateOneResult = { matchedCount: 1 };
  updateOneCalls = [];

  const response = await POST(buildRequest({ slideshowId, pin: false }), buildContext());
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.deepEqual(json.data, { submissionId, slideshowId, pinned: false });
  assert.equal(updateOneCalls.length, 1);
});

test('unpin against a slideshow deleted just before the write throws instead of apiSuccess', async () => {
  slideshowFindOneResult = { slideshowId };
  updateOneResult = { matchedCount: 0 };
  updateOneCalls = [];

  const response = await POST(buildRequest({ slideshowId, pin: false }), buildContext());
  assert.equal(response.status, 404);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.equal(updateOneCalls.length, 1);
});
