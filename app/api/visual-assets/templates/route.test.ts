import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const apiReal = await import('@/lib/api');
const authorizationReal = await import('@/lib/partners/authorization');
const PARTNER_MONGO_ID = new ObjectId();
const PARTNER = { _id: PARTNER_MONGO_ID, partnerId: 'partner-a', name: 'Partner A' };
const PARTNER_MANAGER = { appRole: 'viewer', user: { id: 'manager-a', email: 'manager@example.com', name: 'Manager' } };

function setup(t: TestContext, sourceTemplates: Record<string, unknown>[] = []) {
  const seeded = fakeDb({
    partners: [PARTNER],
    experience_templates: sourceTemplates,
    events: [],
  });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => PARTNER_MANAGER } });
  t.mock.module('@/lib/partners/authorization', { exports: {
    ...authorizationReal,
    assertPartnerMongoWorkspaceAccess: async () => ({ partner: PARTNER, role: 'manager', partnerId: 'partner-a' }),
    getPartnerScopedAccessForEvent: async () => ({ allowed: false, role: null }),
    isGlobalAdminSession: () => false,
  } });
  return seeded;
}

const create = (body: unknown) => new NextRequest('http://localhost/api/visual-assets/templates', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('a partner with no events can create a Partner Journey from the selected Global Journey', async (t) => {
  const seeded = setup(t, [{
    templateId: 'global-default', level: 'global', ownerId: null, name: 'Global default',
    config: { customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: 'Welcome' } }] },
  }]);
  const { POST } = await importRoute('partner-without-events');
  const response = await POST(create({
    level: 'partner', name: 'Partner opening', partnerMongoId: String(PARTNER_MONGO_ID), sourceTemplateId: 'global-default',
  }));
  assert.equal(response.status, 201);
  const data = seeded.data.experience_templates;
  const created = data.find((item) => item.level === 'partner');
  assert.equal(created?.ownerId, 'partner-a');
  assert.equal(created?.name, 'Partner opening');
  assert.deepEqual(created?.config, {
    customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: '', buttonText: '', screenImageAlt: '' } }],
    frameMessageSelectionDisplay: 'messages-only',
  });
  assert.equal(data.some((item) => item.level === 'global' && item.templateId === 'global-default'), true);
});

test('a partner cannot clone a Partner Journey owned by another partner', async (t) => {
  const seeded = setup(t, [{
    templateId: 'partner-b-journey', level: 'partner', ownerId: 'partner-b', name: 'Private journey', config: { customPages: [] },
  }]);
  const { POST } = await importRoute('reject-other-partner-source');
  const response = await POST(create({
    level: 'partner', name: 'Copied journey', partnerMongoId: String(PARTNER_MONGO_ID), sourceTemplateId: 'partner-b-journey',
  }));
  assert.equal(response.status, 400);
  assert.equal(seeded.data.experience_templates.length, 1);
});

test('a Partner Journey cloned from an event keeps consent and identity event-owned', async (t) => {
  const eventId = new ObjectId();
  const sourceEvent = {
    _id: eventId, eventId: 'source-event', partnerId: 'partner-a', name: 'Source event',
    customPages: [
      { pageId: 'welcome', pageType: 'welcome', order: -2, isActive: true, config: { title: 'Welcome' } },
      { pageId: 'identity', pageType: 'who-are-you', order: -1, isActive: true, config: { title: 'Source identity' } },
      { pageId: 'consent', pageType: 'accept', order: -1, isActive: true, config: { title: 'Source consent' } },
      { pageId: 'capture', pageType: 'take-photo', order: 0, isActive: true, config: { title: 'Capture' } },
    ],
  };
  const seeded = fakeDb({ partners: [PARTNER], experience_templates: [], events: [sourceEvent] });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => PARTNER_MANAGER } });
  t.mock.module('@/lib/partners/authorization', { exports: {
    ...authorizationReal,
    assertPartnerMongoWorkspaceAccess: async () => ({ partner: PARTNER, role: 'manager', partnerId: 'partner-a' }),
    getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'manager' }),
    isGlobalAdminSession: () => false,
  } });

  const { POST } = await importRoute('partner-clone-event-consent');
  const response = await POST(create({ level: 'partner', name: 'Reusable flow', partnerMongoId: String(PARTNER_MONGO_ID), sourceEventId: String(eventId) }));
  assert.equal(response.status, 201);
  const created = seeded.data.experience_templates.find((item) => item.level === 'partner');
  assert.ok(created);
  assert.deepEqual((created.config as { customPages: Array<{ pageType: string }> }).customPages.map((page) => page.pageType), ['welcome', 'take-photo']);
});

test('the first valid Global Journey repairs a stale invalid global default', async (t) => {
  const event = {
    _id: new ObjectId(), eventId: 'source-event', partnerId: 'partner-a', name: 'Source event',
    customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: 'Welcome', buttonText: 'Continue' } }],
  };
  const seeded = fakeDb({
    partners: [PARTNER],
    events: [event],
    admin_settings: [{ settingId: 'default-experience-template', templateId: 'broken-global' }],
    experience_templates: [{
      templateId: 'broken-global', level: 'global', ownerId: null, name: 'Broken',
      config: { customPages: [{ pageId: 'bad', userEmail: 'private@example.test' }] },
    }],
  });
  const globalAdmin = { appRole: 'admin', user: { id: 'admin-a', email: 'admin@example.com', name: 'Admin' } };
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => globalAdmin } });
  t.mock.module('@/lib/partners/authorization', { exports: {
    ...authorizationReal,
    assertPartnerMongoWorkspaceAccess: async () => ({ partner: PARTNER, role: 'manager', partnerId: 'partner-a' }),
    getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'manager' }),
    isGlobalAdminSession: () => true,
  } });
  const { POST } = await importRoute('repair-invalid-global-default');
  const response = await POST(create({ level: 'global', name: 'Valid global journey', sourceEventId: String(event._id) }));
  assert.equal(response.status, 201);
  const created = seeded.data.experience_templates.find((item) => item.name === 'Valid global journey');
  assert.ok(created);
  assert.equal(seeded.data.admin_settings.find((item) => item.settingId === 'default-experience-template')?.templateId, created?.templateId);
});
