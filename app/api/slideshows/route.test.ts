import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const DEFAULT_ID = new ObjectId();
const OTHER_ID = new ObjectId();

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext) {
  const seeded = fakeDb({
    slideshows: [
      { _id: DEFAULT_ID, slideshowId: 's-default', eventId: 'e-uuid', name: 'Default slideshow', isDefault: true },
      { _id: OTHER_ID, slideshowId: 's-other', eventId: 'e-uuid', name: 'Mine' },
    ],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/auth/session', { namedExports: { getSession: async () => ({ appRole: 'admin', user: { id: 'a1' } }) } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { isGlobalAdminSession: () => true, getPartnerScopedAccessForEvent: async () => ({ allowed: true }), getPartnerScopedAccessForEventUuid: async () => ({ allowed: true }) } });
  return seeded;
}

const del = (id: ObjectId) => new NextRequest(`http://localhost/api/slideshows?id=${id}`, { method: 'DELETE' });

test('the default slideshow of an event cannot be deleted: make another the default first', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('default');
  const response = await DELETE(del(DEFAULT_ID));
  assert.equal(response.status, 409);
  assert.match(((await response.json()) as { error: string }).error, /Make another slideshow the default first/);
  assert.equal(data.slideshows.length, 2);
});

test('any other slideshow is deleted as before', async (t) => {
  const { data } = setup(t);
  const { DELETE } = await importRoute('other');
  assert.equal((await DELETE(del(OTHER_ID))).status, 200);
  assert.deepEqual(data.slideshows.map((s) => s.slideshowId), ['s-default']);
});

const patch = (id: ObjectId, body: object) => new NextRequest(`http://localhost/api/slideshows?id=${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the crossfade is a switch an editor turns on and off, stored as a boolean (issue 476)', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('crossfade-on');
  assert.equal((await PATCH(patch(OTHER_ID, { crossfade: true }))).status, 200);
  assert.equal((data.slideshows.find((s) => s.slideshowId === 's-other') as { crossfade?: boolean }).crossfade, true);
  assert.equal((await PATCH(patch(OTHER_ID, { crossfade: false }))).status, 200);
  assert.equal((data.slideshows.find((s) => s.slideshowId === 's-other') as { crossfade?: boolean }).crossfade, false);
});

test('anything but true or false for the crossfade is refused and nothing is stored', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('crossfade-bad');
  const response = await PATCH(patch(OTHER_ID, { crossfade: 'yes' }));
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /crossfade must be true or false/);
  assert.equal('crossfade' in (data.slideshows.find((s) => s.slideshowId === 's-other') as object), false);
});


test('a screen design that is refused says what is wrong, stores nothing, and the refusal is logged (owner, 2026-10-09: "do you save the errors?")', async (t) => {
  const { data } = setup(t);
  const logged: Array<{ event: string; context: Record<string, unknown> }> = [];
  t.mock.module('@/lib/observability/logger', { namedExports: { logWarn: (event: string, _message: string, context: Record<string, unknown>) => { logged.push({ event, context }); } } });
  const { PATCH } = await importRoute('design-refused');
  const design = { overlayImageUrl: 'https://images.example.test/overlay.png', window: { left: 2, top: 3, width: 69, height: 69 }, photoFit: 'cover', qr: { url: 'go.messmass.com/mtk-vasas', x: 73, y: 2, size: 24 } };
  const response = await PATCH(patch(OTHER_ID, { screenDesign: design }));
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /QR code address must start with https:\/\//);
  assert.equal('screenDesign' in (data.slideshows.find((s) => s.slideshowId === 's-other') as object), false, 'nothing is stored');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].event, 'slideshow.save_refused');
  assert.equal(logged[0].context.slideshowId, String(OTHER_ID));
  assert.match(String(logged[0].context.error), /QR code address/);
});

const DESIGN = { overlayImageUrl: 'https://images.example.test/overlay.png', window: { left: 2, top: 3, width: 69, height: 69 }, photoFit: 'cover', texts: [{ text: 'FANSELFIE.ME/MTK', x: 2, y: 80, width: 69, size: 10, align: 'center', fit: true }] };

test('saving the screen design of the default slideshow draws the welcome page screen again, also for an event that has none (owner, 2026-10-09)', async (t) => {
  const seeded = setup(t);
  seeded.data.events = [{ _id: new ObjectId(), eventId: 'e-uuid', name: 'MTK' }];
  const scheduled: unknown[][] = [];
  t.mock.module('@/lib/screen/welcome-screen-store', { namedExports: { scheduleWelcomeScreen: (...args: unknown[]) => scheduled.push(args) } });
  const { PATCH } = await importRoute('welcome-default');
  assert.equal((await PATCH(patch(DEFAULT_ID, { screenDesign: DESIGN }))).status, 200);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].length, 1, 'no "only if it exists" condition: the picture is made');
  assert.equal(String(scheduled[0][0]), String(seeded.data.events[0]._id));
});

test('another slideshow of the event, or a save without a screen design, leaves the welcome page screen alone', async (t) => {
  const seeded = setup(t);
  seeded.data.events = [{ _id: new ObjectId(), eventId: 'e-uuid', name: 'MTK' }];
  const scheduled: unknown[][] = [];
  t.mock.module('@/lib/screen/welcome-screen-store', { namedExports: { scheduleWelcomeScreen: (...args: unknown[]) => scheduled.push(args) } });
  const { PATCH } = await importRoute('welcome-other');
  assert.equal((await PATCH(patch(OTHER_ID, { screenDesign: DESIGN }))).status, 200);
  assert.equal((await PATCH(patch(DEFAULT_ID, { name: 'Renamed' }))).status, 200);
  assert.equal(scheduled.length, 0);
});

test('every save asks the open screens to reload, so a saved change shows without pressing "Reload the screen"; a refused save asks for nothing', async (t) => {
  const { data } = setup(t);
  const { PATCH } = await importRoute('reload-on-save');
  const before = data.slideshows.find((s) => s.slideshowId === 's-other') as { reloadRequestedAt?: string; updatedAt?: string };
  assert.equal(before.reloadRequestedAt, undefined);
  assert.equal((await PATCH(patch(OTHER_ID, { name: 'Renamed' }))).status, 200);
  const saved = data.slideshows.find((s) => s.slideshowId === 's-other') as { reloadRequestedAt?: string; updatedAt?: string };
  assert.ok(saved.reloadRequestedAt, 'a reload token is set');
  assert.equal(saved.reloadRequestedAt, saved.updatedAt);
  const token = saved.reloadRequestedAt;
  assert.equal((await PATCH(patch(OTHER_ID, { crossfade: 'yes' }))).status, 400);
  assert.equal((data.slideshows.find((s) => s.slideshowId === 's-other') as { reloadRequestedAt?: string }).reloadRequestedAt, token, 'a refused save changes nothing');
});
