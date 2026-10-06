import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const id = new ObjectId().toHexString();
const request = () => new NextRequest(`http://localhost/api/share/${id}/download?variant=${id}:camera-result`);
const ctx = { params: Promise.resolve({ id }) };

function setup(t: import('node:test').TestContext) {
  const state: { doc: Record<string, unknown> | null } = { doc: null };
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: () => ({ findOne: async () => state.doc, find: () => ({ toArray: async () => [], sort: () => ({ toArray: async () => [] }) }) }),
      }),
    },
  });
  return state;
}

const photo = (over: Record<string, unknown> = {}) => ({ _id: new ObjectId(id), submissionKind: 'original', imageUrl: 'https://example.public.blob.vercel-storage.com/p.jpg', eventId: 'evt-1', eventIds: ['evt-1'], ...over });

test('a photo that is not public cannot be downloaded: the answer is the same as for an unknown id', async (t) => {
  const state = setup(t);
  const { GET } = await importRoute('hidden');
  const cases: Array<[string, Record<string, unknown> | null]> = [
    ['pending', photo({ reviewStatus: 'pending_review' })],
    ['rejected', photo({ reviewStatus: 'rejected' })],
    ['archived', photo({ isArchived: true })],
    ['hidden', photo({ hiddenFromEvents: ['evt-1'] })],
    ['unknown', null],
  ];
  for (const [name, doc] of cases) {
    state.doc = doc;
    const res = await GET(request(), ctx);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    assert.equal(res.status, 404, name);
    assert.equal(body.error, 'Share submission not found', name);
  }
});

test('a public photo is not refused by the rule (approved, legacy without a status)', async (t) => {
  const state = setup(t);
  const { GET } = await importRoute('public');
  for (const [name, doc] of [['approved', photo({ reviewStatus: 'approved' })], ['legacy', photo()]] as const) {
    state.doc = doc;
    const res = await GET(request(), ctx);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    assert.notEqual(body.error, 'Share submission not found', name);
  }
});
