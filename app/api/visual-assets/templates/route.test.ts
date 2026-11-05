import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;
type TemplateRouteModule = typeof import('./[templateId]/route');
const importTemplateRoute = (caseId: string) => import('./[templateId]/route?case=' + caseId) as Promise<TemplateRouteModule>;

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

const updateTemplate = (templateId: string, body: unknown) => new NextRequest(`http://localhost/api/visual-assets/templates/${templateId}`, {
  method: 'PATCH',
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
    customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: 'Welcome' } }],
  });
  assert.equal(data.some((item) => item.level === 'global' && item.templateId === 'global-default'), true);
});

test('customizing an inherited Global Journey creates and selects a partner-owned copy', async (t) => {
  const seeded = setup(t, [{
    templateId: 'global-default', level: 'global', ownerId: null, name: 'Global default',
    config: { customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: 'Welcome' } }] },
  }]);
  const { POST } = await importRoute('partner-inherited-make-default');
  const response = await POST(create({
    level: 'partner', name: 'Partner custom journey', partnerMongoId: String(PARTNER_MONGO_ID),
    sourceTemplateId: 'global-default', makeDefault: true,
  }));

  assert.equal(response.status, 201);
  const payload = await response.json() as { data: { template: { templateId: string; ownerId: string }; selection: { mode: string; templateId: string } } };
  assert.equal(payload.data.template.ownerId, 'partner-a');
  assert.deepEqual(payload.data.selection, { mode: 'template', templateId: payload.data.template.templateId });
  assert.equal(seeded.data.partners[0].defaultExperienceTemplateId, payload.data.template.templateId);
  assert.equal(seeded.data.experience_templates.find((item) => item.templateId === 'global-default')?.name, 'Global default');
});

test('customizing an inherited journey creates and selects an event-owned copy of the live parent config', async (t) => {
  const eventId = new ObjectId();
  const event = { _id: eventId, eventId: 'event-a', partnerId: 'partner-a', name: 'Event A', experienceTemplate: { mode: 'inherit' } };
  const globalJourney = {
    templateId: 'global-default', level: 'global', ownerId: null, name: 'Global default',
    config: { customPages: [
      { pageId: 'welcome', pageType: 'welcome', order: -1, isActive: true, config: { title: 'Parent welcome' } },
      { pageId: 'capture', pageType: 'take-photo', order: 0, isActive: true, config: { title: 'Capture' } },
    ] },
  };
  const seeded = fakeDb({
    partners: [PARTNER], events: [event], experience_templates: [globalJourney],
    admin_settings: [{ settingId: 'default-experience-template', templateId: 'global-default' }],
  });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => PARTNER_MANAGER } });
  t.mock.module('@/lib/partners/authorization', { exports: {
    ...authorizationReal,
    assertPartnerMongoWorkspaceAccess: async () => ({ partner: PARTNER, role: 'manager', partnerId: 'partner-a' }),
    getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'manager' }),
    isGlobalAdminSession: () => false,
  } });

  const { POST } = await importRoute('event-inherited-make-default');
  const response = await POST(create({ level: 'event', name: 'Event custom journey', sourceEventId: String(eventId), makeDefault: true }));

  assert.equal(response.status, 201);
  const payload = await response.json() as { data: { template: { templateId: string; ownerId: string; config: { customPages: Array<{ config: { title: string } }> } }; selection: { mode: string; templateId: string } } };
  assert.equal(payload.data.template.ownerId, 'event-a');
  assert.deepEqual(payload.data.selection, { mode: 'template', templateId: payload.data.template.templateId });
  assert.equal((seeded.data.events[0].experienceTemplate as { templateId: string }).templateId, payload.data.template.templateId);
  assert.equal(payload.data.template.config.customPages[0].config.title, 'Parent welcome');
  assert.equal(seeded.data.experience_templates.filter((item) => item.level === 'event').length, 1);
});

test('the shared journey editor persists complete page configuration on an owned Partner Journey', async (t) => {
  const template = {
    templateId: 'partner-journey', level: 'partner', ownerId: 'partner-a', name: 'Partner journey',
    config: {
      frameMessageSelectionDisplay: 'messages-only',
      customPages: [
        { pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: 'Welcome', buttonText: 'Start', welcomeElements: [{ id: 'hero', type: 'image', imageUrl: 'https://images.example/hero.png', x: 50, y: 20 }] } },
        { pageId: 'capture', pageType: 'take-photo', order: 1, isActive: true, config: { title: 'Capture' } },
      ],
    },
  };
  const seeded = setup(t, [template]);
  const { PATCH } = await importTemplateRoute('partner-full-editor-save');
  const nextConfig = {
    ...template.config,
    defaultPageOrders: { 'default-welcome': 1, 'default-identity': 0 },
    customPages: [
      { ...template.config.customPages[0], order: 1, config: { ...template.config.customPages[0].config, title: 'Welcome home', welcomeElements: [{ id: 'hero', type: 'image', imageUrl: 'https://images.example/hero.png', x: 50, y: 20 }, { id: 'headline', type: 'text', text: 'Together', x: 50, y: 72 }] } },
      { ...template.config.customPages[1], order: 0, config: { title: 'Take your photo', description: 'Use the camera.' } },
    ],
  };
  const response = await PATCH(updateTemplate('partner-journey', { config: nextConfig }), { params: Promise.resolve({ templateId: 'partner-journey' }) });
  assert.equal(response.status, 200);
  const saved = seeded.data.experience_templates.find((item) => item.templateId === 'partner-journey');
  assert.deepEqual((saved?.config as typeof nextConfig).defaultPageOrders, { 'default-welcome': 1, 'default-identity': 0 });
  const savedConfig = saved?.config as { customPages: Array<{ config: Record<string, unknown> }>; defaultPageOrders: Record<string, number> };
  assert.deepEqual(savedConfig.customPages[0].config.welcomeElements, (nextConfig.customPages[0].config as Record<string, unknown>).welcomeElements);
  assert.equal(savedConfig.customPages[1].config.description, 'Use the camera.');
});

test('a Partner manager cannot edit a Global Journey through the shared editor endpoint', async (t) => {
  const seeded = setup(t, [{
    templateId: 'global-journey', level: 'global', ownerId: null, name: 'Global journey',
    config: { customPages: [{ pageId: 'capture', pageType: 'take-photo', order: 0, isActive: true, config: { title: 'Capture' } }] },
  }]);
  const { PATCH } = await importTemplateRoute('partner-cannot-edit-global');
  const response = await PATCH(updateTemplate('global-journey', { config: { customPages: [{ pageId: 'capture', pageType: 'take-photo', order: 0, isActive: true, config: { title: 'Changed' } }] } }), { params: Promise.resolve({ templateId: 'global-journey' }) });
  assert.equal(response.status, 403);
  assert.equal(((seeded.data.experience_templates[0].config as { customPages: Array<{ config: { title: string } }> }).customPages[0].config.title), 'Capture');
});

test('converting legacy event pages to an Event Journey preserves those pages and selects the new version', async (t) => {
  const eventId = new ObjectId();
  const event = {
    _id: eventId, eventId: 'legacy-event', partnerId: 'partner-a', name: 'Legacy event',
    customPages: [{ pageId: 'welcome-local', pageType: 'welcome', order: -1, isActive: true, config: { title: 'Event-specific welcome' } }],
  };
  const seeded = fakeDb({ partners: [PARTNER], events: [event], experience_templates: [] });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => PARTNER_MANAGER } });
  t.mock.module('@/lib/partners/authorization', { exports: {
    ...authorizationReal,
    assertPartnerMongoWorkspaceAccess: async () => ({ partner: PARTNER, role: 'manager', partnerId: 'partner-a' }),
    getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'manager' }),
    isGlobalAdminSession: () => false,
  } });

  const { POST } = await importRoute('event-legacy-snapshot-make-default');
  const response = await POST(create({ level: 'event', name: 'Existing journey', sourceEventId: String(eventId), makeDefault: true }));

  assert.equal(response.status, 201);
  const payload = await response.json() as { data: { template: { templateId: string; config: { customPages: Array<{ pageId: string; config: { title: string } }> } } } };
  assert.equal(payload.data.template.config.customPages[0].pageId, 'welcome-local');
  assert.equal(payload.data.template.config.customPages[0].config.title, 'Event-specific welcome');
  assert.equal((seeded.data.events[0].experienceTemplate as { templateId: string }).templateId, payload.data.template.templateId);
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
