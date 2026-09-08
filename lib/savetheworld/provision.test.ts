import assert from 'node:assert/strict';
import { test } from 'node:test';

type ProvisionModule = typeof import('./provision');

// Fresh (uncached) import per test so each test's mocks bind to their own
// import of provision.ts (same pattern as app/api/internal/tryon/sync/route.test.ts).
function importProvisionModule(caseId: string): Promise<ProvisionModule> {
  const specifier = './provision?case=' + caseId;
  return import(specifier) as Promise<ProvisionModule>;
}

const PARTNER_DOC = { partnerId: 'partner-1', name: 'Test Partner', isActive: true };

function mockDeps(t: import('node:test').TestContext, insertedDocs: Record<string, unknown>[]) {
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: (name: string) => ({
          // No existing savetheworld-linked event -> provisionEvent always creates.
          findOne: async () => (name === 'partners' ? PARTNER_DOC : null),
          insertOne: async (doc: Record<string, unknown>) => {
            insertedDocs.push(doc);
            return { insertedId: 'mongo-id-1' };
          },
        }),
      }),
    },
  });
  t.mock.module('@/lib/db/events', {
    namedExports: {
      inheritPartnerDefaults: async () => ({
        brandColorsOverridden: false,
        framesOverridden: false,
        logosOverridden: false,
        frames: [],
        logos: [],
      }),
    },
  });
}

test('provisionEvent: SAVETHEWORLD_APP_URL unset keeps customPages empty (no regression)', async (t) => {
  delete process.env.SAVETHEWORLD_APP_URL;
  const insertedDocs: Record<string, unknown>[] = [];
  mockDeps(t, insertedDocs);

  const { provisionEvent } = await importProvisionModule('no-app-url');
  const result = await provisionEvent({
    savetheworldEventId: 'stw-1',
    partnerId: 'partner-1',
    eventName: 'Test Event',
  });

  assert.equal(result.created, true);
  assert.equal(insertedDocs.length, 1);
  assert.deepEqual(insertedDocs[0].customPages, []);
});

test('provisionEvent: SAVETHEWORLD_APP_URL set adds a well-formed cta customPages entry', async (t) => {
  process.env.SAVETHEWORLD_APP_URL = 'https://savetheplanet.vercel.app/';
  const insertedDocs: Record<string, unknown>[] = [];
  mockDeps(t, insertedDocs);

  const { provisionEvent } = await importProvisionModule('with-app-url');
  const result = await provisionEvent({
    savetheworldEventId: 'stw-2',
    partnerId: 'partner-1',
    eventName: 'Test Event 2',
  });

  assert.equal(result.created, true);
  assert.equal(insertedDocs.length, 1);

  const pages = insertedDocs[0].customPages as Array<Record<string, unknown>>;
  assert.equal(pages.length, 1);

  const page = pages[0];
  assert.equal(typeof page.pageId, 'string');
  assert.ok((page.pageId as string).length > 0);
  assert.equal(page.pageType, 'cta');
  assert.equal(page.order, 0);
  assert.equal(page.isActive, true);

  const config = page.config as Record<string, unknown>;
  assert.equal(config.hasButton, false);
  assert.equal(typeof config.title, 'string');
  assert.equal(typeof config.description, 'string');
  assert.equal(typeof config.redirectingText, 'string');
  assert.equal(config.checkboxText, `https://savetheplanet.vercel.app/take-action/for/${result.eventId}`);

  delete process.env.SAVETHEWORLD_APP_URL;
});
