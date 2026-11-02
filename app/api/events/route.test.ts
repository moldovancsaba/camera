import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const ADMIN = { appRole: 'admin', user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin' } };

test('new events start without a welcome sample selfie and keep generated frames opt-in', async (t) => {
  const seeded = fakeDb({ partners: [{ partnerId: 'partner-1', name: 'Partner' }], events: [] });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    exports: {
      getPartnerScopedAccessForPartner: async () => ({ allowed: true, role: 'admin', partnerId: 'partner-1' }),
      isGlobalAdminSession: () => true,
      listAccessiblePartnerIds: async () => ['partner-1'],
    },
  });
  t.mock.module('@/lib/db/events', { exports: { inheritPartnerDefaults: async () => ({ brandColor: 'black', brandBorderColor: 'white', brandColorsOverridden: false, frames: [], framesOverridden: false, logos: [], logosOverridden: false }) } });
  t.mock.module('@/lib/screen/new-event-screen', { exports: { scheduleScreenForNewEvent: () => undefined } });
  t.mock.module('@/lib/short-links/store', { exports: { trackedSlugExists: async () => false } });

  const routePath = './route?case=' + 'new-event-defaults';
  const { POST } = await import(routePath);
  const response = await POST(new NextRequest('http://localhost/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'New event', partnerId: 'partner-1' }),
  }));

  assert.equal(response.status, 201);
  const body = await response.json() as { data: { event: { slots: Record<string, unknown>; generatedFrameEnabled: boolean } } };
  assert.deepEqual(body.data.event.slots, { selfie: { useDefault: false } });
  assert.equal(body.data.event.generatedFrameEnabled, false);
  assert.equal(seeded.data.events.length, 1);
});
