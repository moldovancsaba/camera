import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';

type PageModule = typeof import('./page');

async function importPage(caseId: string): Promise<PageModule> {
  return import(`./page?case=${caseId}`) as Promise<PageModule>;
}

test('an inactive stable event landing URL redirects to the event selfies page without materializing a default', async (t) => {
  const id = new ObjectId();
  let materializations = 0;
  t.mock.module('next/navigation', {
    exports: {
      notFound: () => { throw new Error('not-found'); },
      redirect: (path: string) => { throw new Error(`redirect:${path}`); },
    },
  });
  t.mock.module('@/lib/db/mongodb', {
    exports: {
      connectToDatabase: async () => ({
        collection: () => ({ findOne: async () => ({ _id: id, eventId: 'event-uuid', isActive: false, greatestHitsSlug: 'event-selfies' }) }),
      }),
    },
  });
  t.mock.module('@/lib/landing-pages/partner-defaults', {
    exports: { ensureInheritedDefaultLandingPage: async () => (materializations++, null) },
  });

  const page = await importPage('inactive');

  await assert.rejects(
    page.default({ params: Promise.resolve({ eventMongoId: id.toHexString() }) }),
    /redirect:\/greatest-hits\/event-selfies/,
  );
  assert.equal(materializations, 0);
});
