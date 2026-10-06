import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, submission: Record<string, unknown> | null) {
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, checkRateLimit: async () => undefined } });
  t.mock.module('@/lib/savetheworld/internal', { namedExports: { assertInternalSavetheworldSecret: () => undefined } });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async () => (name === 'events' ? { _id: 'e', eventId: 'event-uuid' } : submission),
        }),
      }),
    },
  });
}

const lookup = (id: string) => new NextRequest(`http://localhost/api/internal/savetheworld/pledges?eventId=event-uuid&submissionId=${id}`);
const pledgesOf = async (response: Response) => ((await response.json()) as { data: { pledges: unknown[] } }).data.pledges;

for (const reviewStatus of ['pending_review', 'rejected']) {
  test(`the private lookup of a ${reviewStatus} photo shows nothing`, async (t) => {
    setup(t, { submissionId: 's1', reviewStatus, userName: 'Ann', createdAt: 'x' });
    const { GET } = await importRoute(`private-${reviewStatus}`);
    assert.deepEqual(await pledgesOf(await GET(lookup('s1'))), []);
  });
}

for (const reviewStatus of ['approved', undefined]) {
  test(`the private lookup of a photo that is ${reviewStatus ?? 'from before vetting'} still shows it to its owner`, async (t) => {
    setup(t, { submissionId: 's1', reviewStatus, imageUrl: 'https://store.test/a.jpg', userName: 'Ann', createdAt: 'x' });
    const { GET } = await importRoute(`private-${String(reviewStatus)}`);
    const pledges = (await pledgesOf(await GET(lookup('s1')))) as Array<{ imageUrl: string }>;
    assert.equal(pledges[0]?.imageUrl, 'https://store.test/a.jpg');
  });
}
