import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

const apiReal = await import('@/lib/api');
const authorizationReal = await import('@/lib/partners/authorization');

const EVENT_ID = new ObjectId().toString();
let ipCounter = 0;

type RouteModule = typeof import('./route');

function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

const WHO_ARE_YOU_PAGE = {
  pageId: 'who',
  pageType: 'who-are-you',
  order: 1,
  isActive: true,
  config: { title: 'Who are you?', buttonText: 'Next', nameLabel: 'Name', emailLabel: 'Email' },
};

interface Harness {
  updates: Array<Record<string, unknown>>;
}

function mockDeps(
  t: TestContext,
  options: { event: Record<string, unknown>; session?: Record<string, unknown> | null; partnerAllowed?: boolean }
): Harness {
  const h: Harness = { updates: [] };
  const event = { _id: new ObjectId(EVENT_ID), isActive: true, ...options.event };
  const session = options.session ?? null;
  t.mock.module('@/lib/api', {
    namedExports: {
      ...apiReal,
      optionalAuth: async () => session,
      requireAuth: async () => {
        if (!session) throw apiReal.apiError('Unauthorized', 401);
        return session;
      },
    },
  });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      ...authorizationReal,
      getPartnerScopedAccessForEvent: async () => ({ allowed: options.partnerAllowed ?? false }),
    },
  });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: () => ({
          findOne: async () => event,
          find: () => ({ toArray: async () => [] }),
          updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
            h.updates.push(update.$set);
            Object.assign(event, update.$set);
            return { matchedCount: 1 };
          },
        }),
      }),
    },
  });
  return h;
}

const params = { params: Promise.resolve({ eventId: EVENT_ID }) };

function getRequest(query = ''): NextRequest {
  ipCounter += 1;
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}${query}`, { headers: { 'x-forwarded-for': `203.0.113.${ipCounter}` } });
}

function patchRequest(body: Record<string, unknown>): NextRequest {
  ipCounter += 1;
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

const STORED_VETTING = { required: true, updatedAt: '2026-10-06T00:00:00.000Z', updatedBy: 'admin@example.com' };
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };
const PARTNER_MANAGER = { appRole: 'none', user: { id: 'p1', email: 'manager@example.com', name: 'Manager' } };

const pageIds = (event: { customPages?: Array<{ pageId: string }> }) => (event.customPages ?? []).map((page) => page.pageId);

test('GET as a guest: a vetted event with no who-are-you page gets the default one first; the stored setting is not exposed', async (t) => {
  mockDeps(t, { event: { photoVetting: STORED_VETTING, customPages: [] } });
  const { GET } = await importRouteModule('get-guest-vetted');
  const body = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: Record<string, unknown> & { customPages: Array<{ pageId: string; pageType: string }> } } };
  const event = body.data.event;
  assert.equal(event.photoVettingRequired, true);
  assert.equal('photoVetting' in event, false, 'who changed it and when is admin data');
  assert.equal(event.customPages.length, 1);
  assert.equal(event.customPages[0].pageType, 'who-are-you');
});

test('GET as a guest: an event that already has a who-are-you page before the photo keeps its own pages', async (t) => {
  mockDeps(t, { event: { photoVetting: STORED_VETTING, customPages: [WHO_ARE_YOU_PAGE] } });
  const { GET } = await importRouteModule('get-guest-own-page');
  const body = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { customPages: Array<{ pageId: string }> } } };
  assert.deepEqual(pageIds(body.data.event), ['who']);
});

test('GET as a guest: an event that does not require vetting gets no page added', async (t) => {
  mockDeps(t, { event: { photoVetting: { required: false }, customPages: [] } });
  const { GET } = await importRouteModule('get-guest-not-vetted');
  const body = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: Record<string, unknown> & { customPages: unknown[] } } };
  assert.equal(body.data.event.photoVettingRequired, false);
  assert.deepEqual(body.data.event.customPages, []);
});

test('GET without the guest audience (the admin editor) returns the stored pages untouched', async (t) => {
  mockDeps(t, { event: { photoVetting: STORED_VETTING, customPages: [] } });
  const { GET } = await importRouteModule('get-editor');
  const body = (await (await GET(getRequest(), params)).json()) as { data: { event: Record<string, unknown> & { customPages: unknown[] } } };
  assert.deepEqual(body.data.event.customPages, [], 'the default page is never written back by the editor');
  assert.equal(body.data.event.photoVettingRequired, true);
});

test('PATCH: a global admin switches photo vetting off and the change is attributed', async (t) => {
  const h = mockDeps(t, { event: { photoVetting: STORED_VETTING }, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-admin');
  const response = await PATCH(patchRequest({ photoVetting: { required: false } }), params);
  assert.equal(response.status, 200);
  const setting = h.updates[0].photoVetting as { required: boolean; updatedBy: string | null; updatedAt: string };
  assert.equal(setting.required, false);
  assert.equal(setting.updatedBy, 'admin@example.com');
  assert.ok(setting.updatedAt);
});

test('PATCH: a partner events manager cannot change photo vetting, and nothing is written', async (t) => {
  const h = mockDeps(t, { event: { photoVetting: STORED_VETTING }, session: PARTNER_MANAGER, partnerAllowed: true });
  const { PATCH } = await importRouteModule('patch-manager');
  const response = await PATCH(patchRequest({ photoVetting: { required: false } }), params);
  assert.equal(response.status, 403);
  assert.equal(h.updates.length, 0);
});

test('PATCH: a partner events manager can still update the rest of the event', async (t) => {
  const h = mockDeps(t, { event: { photoVetting: STORED_VETTING }, session: PARTNER_MANAGER, partnerAllowed: true });
  const { PATCH } = await importRouteModule('patch-manager-other');
  assert.equal((await PATCH(patchRequest({ loadingText: 'Hello' }), params)).status, 200);
  assert.equal('photoVetting' in h.updates[0], false);
});

test('PATCH: the setting must be true or false', async (t) => {
  const h = mockDeps(t, { event: { photoVetting: STORED_VETTING }, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-invalid');
  assert.equal((await PATCH(patchRequest({ photoVetting: { required: 'yes' } }), params)).status, 400);
  assert.equal((await PATCH(patchRequest({ photoVetting: null }), params)).status, 400);
  assert.equal(h.updates.length, 0);
});
