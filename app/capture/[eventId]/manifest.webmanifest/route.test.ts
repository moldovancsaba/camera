import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_DEFAULT_CTA_BRAND_COLOR } from '@/lib/gds/tokens/colors';

type RouteModule = typeof import('./route');

// A fresh (uncached) query string per call so each test's mock binds to its own import of route.ts.
function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

const eventId = new ObjectId().toHexString();
const call = (GET: RouteModule['GET'], id: string) =>
  GET(new Request(`http://localhost/capture/${id}/manifest.webmanifest`), { params: Promise.resolve({ eventId: id }) });

test('a malformed event id is a 404 and the database is not read', async (t) => {
  let reads = 0;
  t.mock.module('@/lib/events/capture-event', {
    namedExports: { loadCaptureEvent: async () => (reads++, null) },
  });

  const { GET } = await importRouteModule('bad-id');
  const res = await call(GET, 'not-an-object-id');

  assert.equal(res.status, 404);
  assert.equal(reads, 0);
});

test('an unknown event is a 404', async (t) => {
  t.mock.module('@/lib/events/capture-event', { namedExports: { loadCaptureEvent: async () => null } });

  const { GET } = await importRouteModule('unknown-event');

  assert.equal((await call(GET, eventId)).status, 404);
});

test('a known event gets its own manifest, served as a manifest with a short shared cache', async (t) => {
  t.mock.module('@/lib/events/capture-event', {
    namedExports: { loadCaptureEvent: async () => ({ name: 'Summer Fest', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR }) },
  });
  // The manifest takes the page colour of the event's theme (camera#285); here the theme cannot be loaded, so the brand colour stays.
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({}) } });
  t.mock.module('@/lib/theme/load', { namedExports: { loadEventTheme: async () => Promise.reject(new Error('no theme')) } });

  const { GET } = await importRouteModule('known-event');
  const res = await call(GET, eventId);
  const manifest = await res.json();

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/manifest+json');
  assert.match(res.headers.get('cache-control') ?? '', /s-maxage=300/);
  assert.equal(manifest.name, 'Summer Fest');
  assert.equal(manifest.theme_color, CAMERA_DEFAULT_CTA_BRAND_COLOR);
  assert.equal(manifest.start_url, `/capture/${eventId}?source=pwa`);
  assert.equal(manifest.orientation, 'any');
});

test('the manifest takes the page colour of the event theme for the toolbar and the splash', async (t) => {
  t.mock.module('@/lib/events/capture-event', { namedExports: { loadCaptureEvent: async () => ({ name: 'Derby', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR }) } });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({}) } });
  t.mock.module('@/lib/theme/load', { namedExports: { loadEventTheme: async () => ({ background: CAMERA_DEFAULT_BRAND_COLOR }) } });

  const { GET } = await importRouteModule('themed');
  const manifest = await (await call(GET, eventId)).json();

  assert.equal(manifest.theme_color, CAMERA_DEFAULT_BRAND_COLOR);
  assert.equal(manifest.background_color, CAMERA_DEFAULT_BRAND_COLOR);
});
