import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { shownLogo } from '@/lib/library/logos';

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };
const NOW = '2026-10-08T12:00:00.000Z';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const logo = (logoId: string, extra: Record<string, unknown> = {}) => ({ logoId, name: `Logo ${logoId}`, imageUrl: `https://img.example/${logoId}.png`, thumbnailUrl: `https://img.example/${logoId}-t.png`, isActive: true, ...extra });
const row = (logoId: string, scenario: string, order: number, isActive = true) => ({ logoId, scenario, order, isActive, addedAt: NOW, addedBy: 'system' });

function setup(t: TestContext, eventLogos: unknown[] = [], on: { eventSlots?: Record<string, unknown>; partnerSlots?: Record<string, unknown>; eventExtra?: Record<string, unknown> } = {}) {
  const seeded = fakeDb({
    logos: [
      logo('g1'),
      logo('g2'),
      logo('g3', { isActive: false }),
      logo('p1', { scope: 'partner', partnerId: 'P', source: 'messmass' }),
      logo('x1', { scope: 'partner', partnerId: 'OTHER' }),
      logo('e1', { scope: 'event', eventId: 'e-uuid', partnerId: 'P' }),
      logo('e2', { scope: 'event', eventId: 'other-uuid', partnerId: 'P' }),
    ],
    partners: [{ partnerId: 'P', name: 'Partner P', library: { frames: [], logos: ['g1', 'g3'] }, ...(on.partnerSlots ? { slots: on.partnerSlots } : {}) }],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'Event', isActive: true, logos: eventLogos, ...(on.eventSlots ? { slots: on.eventSlots } : {}), ...(on.eventExtra ?? {}) }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/auth/session', { namedExports: { getSession: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'admin', partnerId: 'P' }) } });
  return seeded;
}

const params = { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID) }) };
const post = (body: Record<string, unknown>) =>
  new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/logos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isActive: true, ...body }) });
const rows = (data: Record<string, Array<Record<string, unknown>>>) => (data.events[0].logos as Array<{ logoId: string; scenario: string; order: number }>).map((r) => [r.logoId, r.scenario, r.order]);

test("an event takes a logo of its partner's library in a scenario, and the event now has its own logo list", async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('library');
  assert.equal((await POST(post({ logoId: 'g1', scenario: 'onboarding-thankyou' }), params)).status, 200);
  assert.deepEqual(rows(data), [['g1', 'onboarding-thankyou', 0]]);
  assert.equal(data.events[0].logosOverridden, true);
});

test('the same logo goes into another scenario; its partner logo from messmass and its own upload can be taken too', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('more');
  assert.equal((await POST(post({ logoId: 'g1', scenario: 'onboarding-thankyou' }), params)).status, 200);
  assert.equal((await POST(post({ logoId: 'g1', scenario: 'loading-capture', order: 2 }), params)).status, 200);
  assert.equal((await POST(post({ logoId: 'p1', scenario: 'loading-slideshow' }), params)).status, 200);
  assert.equal((await POST(post({ logoId: 'e1', scenario: 'slideshow-transition' }), params)).status, 200);
  assert.deepEqual(rows(data), [['g1', 'onboarding-thankyou', 0], ['g1', 'loading-capture', 2], ['p1', 'loading-slideshow', 0], ['e1', 'slideshow-transition', 0]]);
});

test('an event cannot take a logo straight from the global library, from another partner or event, or one that is switched off', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('refuse');
  const global = await POST(post({ logoId: 'g2', scenario: 'onboarding-thankyou' }), params);
  assert.equal(global.status, 400);
  assert.match(((await global.json()) as { error: string }).error, /partner library/i);
  assert.equal((await POST(post({ logoId: 'x1', scenario: 'onboarding-thankyou' }), params)).status, 400);
  assert.equal((await POST(post({ logoId: 'e2', scenario: 'onboarding-thankyou' }), params)).status, 400);
  assert.equal((await POST(post({ logoId: 'g3', scenario: 'onboarding-thankyou' }), params)).status, 400, 'switched off in the library');
  assert.equal((await POST(post({ logoId: 'nope', scenario: 'onboarding-thankyou' }), params)).status, 404);
  assert.equal((await POST(post({ logoId: 'g1', scenario: 'everywhere' }), params)).status, 400);
  assert.equal((await POST(post({ logoId: 'g1' }), params)).status, 400, 'a scenario is required');
  assert.deepEqual(rows(data), []);
  assert.equal(data.events[0].logosOverridden, undefined, 'a refused assignment writes nothing');
});

test('the same logo is not assigned twice to one scenario', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('twice');
  assert.equal((await POST(post({ logoId: 'g1', scenario: 'loading-capture' }), params)).status, 200);
  assert.equal((await POST(post({ logoId: 'g1', scenario: 'loading-capture' }), params)).status, 400);
  assert.deepEqual(rows(data), [['g1', 'loading-capture', 0]]);
});

type Grouped = Record<string, Array<{ logoId: string; scenario: string; order: number; isActive: boolean; name: string; imageUrl: string; thumbnailUrl: string }>>;

test('what the guest pages read is unchanged: grouped by scenario, in order, inactive rows kept, missing logos left out, any owner alike', async (t) => {
  // The defaults give an event the same logo in every scenario; partner and event logos resolve like global ones.
  setup(t, [row('g1', 'slideshow-transition', 0), row('g1', 'onboarding-thankyou', 1), row('g1', 'loading-slideshow', 2), row('g1', 'loading-capture', 3), row('p1', 'onboarding-thankyou', 0, false), row('e1', 'loading-capture', 3), row('gone', 'loading-capture', 0), row('g2', 'loading-capture', 1, false)]);
  const { GET } = await importRoute('guest');
  const response = await GET(new NextRequest(`http://localhost/api/events/e-uuid/logos`), { params: Promise.resolve({ eventId: 'e-uuid' }) });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { eventId: string; eventName: string; logos: Grouped } };
  assert.equal(body.data.eventId, String(EVENT_MONGO_ID));
  assert.equal(body.data.eventName, 'Event');
  const view = (scenario: string) => body.data.logos[scenario].map((r) => [r.logoId, r.order, r.isActive, r.imageUrl]);
  assert.deepEqual(Object.keys(body.data.logos), ['slideshow-transition', 'onboarding-thankyou', 'loading-slideshow', 'loading-capture']);
  assert.deepEqual(view('slideshow-transition'), [['g1', 0, true, 'https://img.example/g1.png']]);
  assert.deepEqual(view('onboarding-thankyou'), [['p1', 0, false, 'https://img.example/p1.png'], ['g1', 1, true, 'https://img.example/g1.png']]);
  assert.deepEqual(view('loading-slideshow'), [['g1', 2, true, 'https://img.example/g1.png']]);
  assert.deepEqual(view('loading-capture'), [['g2', 1, false, 'https://img.example/g2.png'], ['g1', 3, true, 'https://img.example/g1.png'], ['e1', 3, true, 'https://img.example/e1.png']]);
  assert.equal(body.data.logos['onboarding-thankyou'][1].thumbnailUrl, 'https://img.example/g1-t.png');
  assert.equal(body.data.logos['loading-capture'][0].name, 'Logo g2');
  // The capture page and the slideshow show the first active logo of a scenario; the event page marks the same one.
  assert.equal(body.data.logos['onboarding-thankyou'].find((r) => r.isActive)?.logoId, 'g1');
  assert.equal(body.data.logos['loading-capture'].find((r) => r.isActive)?.logoId, 'g1');
  for (const scenario of Object.keys(body.data.logos)) assert.equal(shownLogo(body.data.logos[scenario])?.logoId, body.data.logos[scenario].find((r) => r.isActive)?.logoId, scenario);
});

test('the logo id must be a plain text, and order and isActive plain values: an array that happens to print as a valid id stores nothing', async (t) => {
  const { data } = setup(t);
  const { POST } = await importRoute('plain-values');
  assert.equal((await POST(post({ logoId: ['g1'], scenario: 'onboarding-thankyou' }), params)).status, 400);
  assert.equal((await POST(post({ logoId: 'g1', scenario: 'onboarding-thankyou', order: 'first' }), params)).status, 400);
  assert.equal((await POST(post({ logoId: 'g1', scenario: 'onboarding-thankyou', isActive: 'yes' }), params)).status, 400);
  assert.deepEqual(rows(data), [], 'nothing was stored');
  assert.equal(data.events[0].logosOverridden, undefined);
});

test('an event on the slot model: each place of use answers from its chain (partner, event, place); the old list is not read', async (t) => {
  setup(t, [row('g2', 'onboarding-thankyou', 0)], {
    partnerSlots: { logo: { items: ['p1'] } },
    eventSlots: { logo: { items: ['g1'] }, 'logo-capture-loading': { items: ['e1'], useDefault: false } },
  });
  const { GET } = await importRoute('slots');
  const body = (await (await GET(new NextRequest('http://localhost/api/events/e-uuid/logos'), { params: Promise.resolve({ eventId: 'e-uuid' }) })).json()) as { data: { logos: Grouped } };
  const view = (scenario: string) => body.data.logos[scenario].map((r) => `${r.logoId}:${(r as unknown as { level: string }).level}`);
  assert.deepEqual(view('onboarding-thankyou'), ['g1:event', 'p1:partner'], 'the event\'s own logo, then the partner\'s; the old row g2 is not read');
  assert.deepEqual(view('loading-capture'), ['e1:place'], 'replaced in this place only');
  assert.deepEqual(view('loading-slideshow'), ['g1:event', 'p1:partner']);
  assert.equal(body.data.logos['onboarding-thankyou'].every((r) => r.isActive), true);
  assert.equal(body.data.logos['onboarding-thankyou'][0].imageUrl, 'https://img.example/g1.png');
});

test('an event on the slot model with nothing stored uses the partner\'s logo; one the library no longer has is left out', async (t) => {
  setup(t, [], { partnerSlots: { logo: { items: ['gone', 'p1'] } }, eventSlots: {} });
  const { GET } = await importRoute('slots-partner');
  const body = (await (await GET(new NextRequest('http://localhost/api/events/e-uuid/logos'), { params: Promise.resolve({ eventId: 'e-uuid' }) })).json()) as { data: { logos: Grouped } };
  assert.deepEqual(body.data.logos['loading-capture'].map((r) => r.logoId), ['p1']);
});

const eventDoc = (data: ReturnType<typeof setup>['data']) => data.events[0] as { slotSnapshots?: Record<string, Array<{ id: string; name: string; imageUrl: string | null }>> };
const getLogos = async (id: string) => {
  const { GET } = await importRoute(id);
  return (await (await GET(new NextRequest('http://localhost/api/events/e-uuid/logos'), { params: Promise.resolve({ eventId: 'e-uuid' }) })).json()) as { data: { logos: Record<string, Array<{ logoId: string; imageUrl: string; lost?: boolean; name: string }>> } };
};

test('an event on the slot model keeps a snapshot of what it uses; a page view writes it only when it differs', async (t) => {
  const { data } = setup(t, [], { partnerSlots: { logo: { items: ['p1'] } }, eventSlots: {} });
  await getLogos('snap-first');
  assert.deepEqual(eventDoc(data).slotSnapshots?.['logo-pages']?.map((i) => i.id), ['p1'], 'the first view takes the snapshot');
  const before = JSON.stringify(eventDoc(data).slotSnapshots);
  await getLogos('snap-second');
  assert.equal(JSON.stringify(eventDoc(data).slotSnapshots), before, 'a second view with nothing changed changes nothing');
});

test('THE FAIL-SAFE: a logo the library no longer has is still served from the event\'s snapshot, marked lost, in every place that uses it', async (t) => {
  const snapshot = { id: 'gone', name: 'Lost logo', imageUrl: 'https://img.example/gone.png', thumbnailUrl: null, mimeType: 'image/png', width: 10, height: 5, scope: 'partner', takenAt: NOW };
  const kept = setup(t, [], { partnerSlots: { logo: { items: ['gone', 'p1'] } }, eventSlots: {}, eventExtra: { slotSnapshots: { 'logo-pages': [snapshot], 'logo-capture-loading': [snapshot] } } });
  const body = await getLogos('lost-kept');
  assert.deepEqual(body.data.logos['onboarding-thankyou'].map((r) => [r.logoId, r.lost ?? false]), [['gone', true], ['p1', false]]);
  assert.equal(body.data.logos['onboarding-thankyou'][0].imageUrl, 'https://img.example/gone.png');
  assert.deepEqual(body.data.logos['loading-slideshow'].map((r) => [r.logoId, r.lost ?? false]), [['gone', true], ['p1', false]], 'the same lost logo is kept in the places where it was not snapshotted yet');
  assert.deepEqual(eventDoc(kept.data).slotSnapshots?.['logo-pages']?.map((i) => i.id), ['gone', 'p1'], 'the lost one stays in the snapshot, and p1 joins it');
});

test('an event that is not on the model is answered as before and gets no snapshot', async (t) => {
  const { data } = setup(t, [row('g1', 'onboarding-thankyou', 0)]);
  await getLogos('legacy-no-snapshot');
  assert.equal(eventDoc(data).slotSnapshots, undefined);
});

