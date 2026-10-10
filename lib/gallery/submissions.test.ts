import assert from 'node:assert/strict';
import { test } from 'node:test';

test('a gallery never lists a picture that is gone, nor the photos the rule already keeps out', async (t) => {
  t.mock.module('@/lib/db/sso', { namedExports: { getInactiveUserEmails: async () => new Set<string>() } });
  const importFresh = (caseId: string) => import('./submissions?case=' + caseId) as Promise<typeof import('./submissions')>;
  const { galleryFilter } = await importFresh('filter');
  const filter = (await galleryFilter('event-uuid-1')) as { $and: Array<Record<string, unknown>> };
  const has = (clause: unknown) => filter.$and.some((candidate) => JSON.stringify(candidate) === JSON.stringify(clause));
  assert.ok(has({ 'mediaHealth.broken': { $ne: true } }), 'a picture that is gone');
  assert.ok(has({ isArchived: { $ne: true } }), 'archived');
  assert.ok(has({ $or: [{ submissionKind: { $exists: false } }, { submissionKind: 'original' }] }), 'a plain photo only: a stored try-on result is not listed (issue 557)');
});
