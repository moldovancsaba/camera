import assert from 'node:assert/strict';
import { test } from 'node:test';

type LayoutModule = typeof import('./layout');

async function importLayout(caseId: string): Promise<LayoutModule> {
  return import(`./layout?case=${caseId}`) as Promise<LayoutModule>;
}

test('an inactive event composite screen redirects to its Greatest Selfies page', async (t) => {
  t.mock.module('next/navigation', {
    exports: { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
  });
  t.mock.module('@/lib/db/mongodb', {
    exports: {
      connectToDatabase: async () => ({
        collection: () => ({ findOne: async () => ({ eventId: 'event-uuid' }) }),
      }),
    },
  });
  t.mock.module('@/lib/slideshow/resolve-event', {
    exports: {
      findEventForSlideshow: async () => ({ isActive: false, greatestHitsSlug: 'event-selfies' }),
    },
  });

  const { default: layout } = await importLayout('inactive-event');
  await assert.rejects(
    layout({ children: null, params: Promise.resolve({ layoutId: 'layout-1' }) }),
    /redirect:\/greatest-hits\/event-selfies/,
  );
});
