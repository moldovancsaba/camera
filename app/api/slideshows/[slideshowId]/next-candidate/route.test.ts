import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

test('the candidate query applies the shared visibility rule: not archived, not hidden, not pending or rejected, plain photos only (never a stored try-on result)', async (t) => {
  const filters: Array<{ $and: unknown[] }> = [];
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: (name: string) =>
          name === 'slideshows'
            ? { findOne: async () => ({ slideshowId: 's1', eventId: 'evt-1' }) }
            : { find: (filter: { $and: unknown[] }) => (filters.push(filter), { sort: () => ({ toArray: async () => [] }) }) },
      }),
    },
  });
  t.mock.module('@/lib/slideshow/resolve-event', { namedExports: { findEventForSlideshow: async () => ({ _id: 'a'.repeat(24), eventId: 'evt-1' }) } });

  const { GET } = await importRoute('rule');
  const res = await GET(new NextRequest('http://localhost/api/slideshows/s1/next-candidate'), { params: Promise.resolve({ slideshowId: 's1' }) });
  assert.equal(res.status, 200);
  assert.equal(filters.length, 1);
  const text = JSON.stringify(filters[0].$and);
  assert.match(text, /"isArchived":\{"\$ne":true\}/);
  assert.match(text, /"hiddenFromEvents"/);
  assert.match(text, /"reviewStatus":\{"\$nin":\["pending_review","rejected"\]\}/);
  assert.match(text, /"submissionKind":\{"\$exists":false\}\},\{"submissionKind":"original"/, 'only a plain photo: no kind or original');
  assert.doesNotMatch(text, /tryon_result/, 'a stored try-on result has no branch that lets it in');
});
