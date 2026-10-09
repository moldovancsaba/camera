import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext, options: { allowed?: boolean; event?: Record<string, unknown> } = {}) {
  const seeded = fakeDb({
    frames: [],
    logos: [],
    partners: [{ partnerId: 'P', name: 'Partner P' }],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'Event', frames: [], logos: [], ...(options.event ?? {}) }],
  });
  const stored: string[] = [];
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { getPartnerScopedAccessForEvent: async () => ({ allowed: options.allowed !== false, role: 'admin', partnerId: 'P' }) } });
  t.mock.module('@/lib/imgbb/upload', {
    namedExports: {
      uploadImage: async (file: File) => {
        stored.push(file.name);
        return { success: true, imageUrl: 'https://blob.example/event-frame.png', thumbnailUrl: '', deleteUrl: '', imageId: '', fileSize: file.size, mimeType: file.type, fileName: file.name, provider: 'blob', mirrorImageUrl: null };
      },
    },
  });
  return { ...seeded, stored };
}

const params = { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID) }) };
function post(fields: Record<string, string>, file?: File): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) form.set('file', file);
  return new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/library/upload`, { method: 'POST', body: form });
}
const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'pink.png', { type: 'image/png' });

test('an upload for an event is its own frame, assigned at once, and the event now has its own list', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('ok');
  const response = await POST(post({ kind: 'frames', name: 'Pink match frame' }, png()), params);
  assert.equal(response.status, 201);
  const frame = data.frames[0] as Record<string, unknown>;
  assert.equal(frame.scope, 'event');
  assert.equal(frame.eventId, 'e-uuid', 'the event UUID, like the partner UUID');
  assert.equal(frame.partnerId, 'P');
  const event = data.events[0] as { frames: Array<{ frameId: string; isActive: boolean; addedBy: string }>; framesOverridden?: boolean };
  assert.deepEqual(event.frames.map((f) => [f.frameId, f.isActive, f.addedBy]), [[frame.frameId, true, 'a1']]);
  assert.equal(event.framesOverridden, true, 'a later change of the partner defaults must not replace it');
});

test('a bad upload changes nothing on the event', async (t) => {
  const { data, stored } = setup(t);
  const { POST } = await importRoute('bad');
  assert.equal((await POST(post({ kind: 'frames', name: '' }, png()), params)).status, 400);
  assert.equal((await POST(post({ kind: 'frames', name: 'x' }, new File([new Uint8Array([1])], 'a.gif', { type: 'image/gif' })), params)).status, 400);
  assert.equal((await POST(post({ kind: 'logos', name: 'x', scenario: 'nowhere' }, png()), params)).status, 400, 'a logo needs a scenario that exists');
  assert.deepEqual(stored, []);
  assert.deepEqual((data.events[0] as { frames: unknown[] }).frames, []);
  assert.deepEqual((data.events[0] as { logos?: unknown[] }).logos, []);
  assert.equal((data.events[0] as { framesOverridden?: boolean }).framesOverridden, undefined);
  assert.equal((data.events[0] as { logosOverridden?: boolean }).logosOverridden, undefined);
});

test('a logo uploaded for an event is assigned at once in the scenario chosen, and the event now has its own logo list', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('logo');
  const response = await POST(post({ kind: 'logos', name: 'Match crest', scenario: 'loading-capture' }, png()), params);
  assert.equal(response.status, 201);
  const logo = data.logos[0] as Record<string, unknown>;
  assert.deepEqual([logo.scope, logo.eventId, logo.partnerId], ['event', 'e-uuid', 'P']);
  const event = data.events[0] as { logos: Array<Record<string, unknown>>; logosOverridden?: boolean; framesOverridden?: boolean };
  assert.deepEqual(event.logos.map((l) => [l.logoId, l.scenario, l.order, l.isActive, l.addedBy]), [[logo.logoId, 'loading-capture', 0, true, 'a1']]);
  assert.equal(event.logosOverridden, true, 'a later change of the partner defaults must not replace it');
  assert.equal(event.framesOverridden, undefined, 'the frames are not touched');
  assert.deepEqual((data.events[0] as { frames: unknown[] }).frames, []);
});

test('a logo uploaded without a scenario goes on top of the guest pages (onboarding-thankyou)', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('logo-default');
  assert.equal((await POST(post({ kind: 'logos', name: 'Match crest' }, png()), params)).status, 201);
  assert.equal(((data.events[0] as { logos: Array<{ scenario: string }> }).logos)[0].scenario, 'onboarding-thankyou');
});

test('without manager access to the event nothing is uploaded', async (t) => {
  const { data, stored } = setup(t, { allowed: false });
  const { POST } = await importRoute('denied');
  assert.equal((await POST(post({ kind: 'frames', name: 'x' }, png()), params)).status, 403);
  assert.deepEqual(stored, []);
  assert.equal(data.frames.length, 0);
});

test('a logo uploaded with a slot joins that slot of the event (on the slot model), not the old list, and needs no scenario', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('slot-logo');
  const response = await POST(post({ kind: 'logos', slot: 'logo', name: 'Own logo' }, png()), params);
  assert.equal(response.status, 201);
  const logo = data.logos[0] as Record<string, unknown>;
  assert.equal(logo.scope, 'event');
  const event = data.events[0] as { slots?: Record<string, { items?: string[] }>; logos: unknown[]; logosOverridden?: unknown };
  assert.deepEqual(event.slots, { logo: { items: [logo.logoId as string] } });
  assert.deepEqual(event.logos, [], 'the old list is not touched');
  assert.equal(event.logosOverridden, undefined);
  const body = (await response.json()) as { data: { slot: { items: string[] } } };
  assert.deepEqual(body.data.slot.items, [logo.logoId]);
});

test('an upload to a place of use of an event that is not on the model seeds its slots from its old list first, so it keeps showing what it showed', async (t) => {
  const old = [{ logoId: 'g1', scenario: 'onboarding-thankyou', order: 0, isActive: true }, { logoId: 'g1', scenario: 'loading-capture', order: 0, isActive: true }, { logoId: 'g1', scenario: 'loading-slideshow', order: 0, isActive: true }, { logoId: 'g1', scenario: 'slideshow-transition', order: 0, isActive: true }];
  const { data } = setup(t, { event: { logos: old, logosOverridden: true } });
  const { POST } = await importRoute('slot-seed');
  assert.equal((await POST(post({ kind: 'logos', slot: 'logo-capture-loading', name: 'Loading logo' }, png()), params)).status, 201);
  const event = data.events[0] as { slots: Record<string, { items?: string[]; useDefault?: boolean }>; logos: unknown[] };
  assert.deepEqual(event.slots.logo, { items: ['g1'], useDefault: false });
  assert.equal(event.slots['logo-capture-loading'].items?.length, 1);
  assert.equal(event.logos.length, 4, 'the old list is still there');
});

test('an unknown slot is refused before the file is stored', async (t) => {
  const { data, stored } = setup(t);
  const { POST } = await importRoute('slot-bad');
  assert.equal((await POST(post({ kind: 'logos', slot: 'frames', name: 'Nope' }, png()), params)).status, 400);
  assert.deepEqual(stored, []);
  assert.deepEqual(data.logos, []);
});

