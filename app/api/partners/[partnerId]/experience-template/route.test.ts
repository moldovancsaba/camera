import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const apiReal = await import('@/lib/api');
const authorizationReal = await import('@/lib/partners/authorization');

test('partner journey settings expose every valid Global Journey as a clone source', async (t) => {
  const partner = { _id: new ObjectId(), partnerId: 'partner-a', defaultExperienceTemplateId: 'partner-default' };
  const seeded = fakeDb({
    partners: [partner],
    events: [
      { _id: new ObjectId(), eventId: 'event-a', partnerId: 'partner-a', name: 'Event A', eventDate: '2026-11-01' },
      { _id: new ObjectId(), eventId: 'event-b', partnerId: 'partner-a', name: 'Event B', eventDate: '2026-11-02' },
      { _id: new ObjectId(), eventId: 'event-other', partnerId: 'partner-b', name: 'Other partner event' },
    ],
    admin_settings: [{ settingId: 'default-experience-template', templateId: 'global-default' }],
    experience_templates: [
      { templateId: 'global-default', level: 'global', ownerId: null, name: 'Global default', config: { customPages: [] }, updatedAt: '2026-11-04T00:00:00.000Z' },
      { templateId: 'global-alternate', level: 'global', ownerId: null, name: 'Global alternate', config: { customPages: [] }, updatedAt: '2026-11-03T00:00:00.000Z' },
      { templateId: 'partner-default', level: 'partner', ownerId: 'partner-a', name: 'Partner default', config: { customPages: [] } },
      { templateId: 'broken-global', level: 'global', ownerId: null, name: 'Broken', config: { customPages: [{ userEmail: 'private@example.test' }] } },
    ],
  });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => ({ appRole: 'viewer', user: { id: 'manager-a', email: 'manager@example.com' } }) } });
  t.mock.module('@/lib/partners/authorization', { exports: {
    ...authorizationReal,
    assertPartnerMongoWorkspaceAccess: async () => ({ partner, role: 'manager', partnerId: 'partner-a' }),
  } });

  const { GET } = await importRoute('all-global-clone-sources');
  const response = await GET(
    new NextRequest('http://localhost/api/partners/partner-a/experience-template'),
    { params: Promise.resolve({ partnerId: String(partner._id) }) },
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as { data: { globalTemplates: Array<{ templateId: string }>; globalTemplateId: string; sourceEvents: Array<{ _id: string; eventId: string }> } };
  assert.deepEqual(payload.data.globalTemplates.map((template) => template.templateId), ['global-default', 'global-alternate']);
  assert.equal(payload.data.globalTemplateId, 'global-default');
  assert.deepEqual(payload.data.sourceEvents.map((event) => event.eventId), ['event-a', 'event-b']);
});
