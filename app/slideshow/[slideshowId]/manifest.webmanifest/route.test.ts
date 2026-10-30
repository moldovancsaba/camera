import assert from 'node:assert/strict';
import { test } from 'node:test';

type RouteModule = typeof import('./route');

async function importRoute(caseId: string): Promise<RouteModule> {
  return import(`./route?case=${caseId}`) as Promise<RouteModule>;
}

test('an inactive event slideshow manifest redirects to the event selfies page', async (t) => {
  t.mock.module('@/lib/db/mongodb', {
    exports: {
      connectToDatabase: async () => ({
        collection: () => ({ findOne: async () => ({ slideshowId: 'screen-1', eventId: 'event-uuid' }) }),
      }),
    },
  });
  t.mock.module('@/lib/slideshow/resolve-event', {
    exports: { findEventForSlideshow: async () => ({ _id: { toString: () => 'event-id' }, greatestHitsSlug: 'event-selfies', isActive: false }) },
  });
  t.mock.module('@/lib/slideshow/stage-theme', {
    exports: { cachedStageTheme: async () => { throw new Error('inactive events must redirect before loading a theme'); } },
  });

  const { GET } = await importRoute('inactive');
  const response = await GET(new Request('https://camera.example/slideshow/screen-1/manifest.webmanifest'), {
    params: Promise.resolve({ slideshowId: 'screen-1' }),
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://camera.example/greatest-hits/event-selfies');
});
