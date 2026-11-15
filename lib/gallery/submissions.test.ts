import assert from 'node:assert/strict';
import { test } from 'node:test';

test('a gallery never lists a picture that is gone, nor the photos the rule already keeps out', async (t) => {
  t.mock.module('@/lib/db/sso', { exports: { getInactiveUserEmails: async () => new Set<string>() } });
  const importFresh = (caseId: string) => import('./submissions?case=' + caseId) as Promise<typeof import('./submissions')>;
  const { galleryFilter } = await importFresh('filter');
  const filter = (await galleryFilter('event-uuid-1')) as { $and: Array<Record<string, unknown>> };
  const has = (clause: unknown) => filter.$and.some((candidate) => JSON.stringify(candidate) === JSON.stringify(clause));
  assert.ok(has({ 'mediaHealth.broken': { $ne: true } }), 'a picture that is gone');
  assert.ok(has({ isArchived: { $ne: true } }), 'archived');
  assert.ok(has({ $or: [{ submissionKind: { $exists: false } }, { submissionKind: 'original' }] }), 'a plain photo only: a stored try-on result is not listed (issue 557)');
});

test('loadGallerySubmissions queries all submissions when no limit is passed and respects limit when provided', async (t) => {
  t.mock.module('@/lib/db/sso', { exports: { getInactiveUserEmails: async () => new Set<string>() } });
  const importFresh = (caseId: string) => import('./submissions?case=' + caseId) as Promise<typeof import('./submissions')>;
  const { loadGallerySubmissions } = await importFresh('load');

  let appliedLimit: number | undefined;
  const mockCursor = {
    sort: () => mockCursor,
    limit: (n: number) => { appliedLimit = n; return mockCursor; },
    toArray: async () => [{ _id: '1' }, { _id: '2' }],
  };
  const mockDb = {
    collection: () => ({
      find: () => mockCursor,
      countDocuments: async () => 2,
    }),
  } as unknown as import('mongodb').Db;

  // Without limit
  const resAll = await loadGallerySubmissions(mockDb, 'event-1');
  assert.equal(resAll.submissions.length, 2);
  assert.equal(appliedLimit, undefined, 'no limit was applied');

  // With explicit limit
  const resLimited = await loadGallerySubmissions(mockDb, 'event-1', 10);
  assert.equal(resLimited.submissions.length, 2);
  assert.equal(appliedLimit, 10, 'limit was applied');
});
