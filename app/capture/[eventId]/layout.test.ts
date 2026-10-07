import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_DEFAULT_CTA_BRAND_COLOR } from '@/lib/gds/tokens/colors';

type LayoutModule = typeof import('./layout');

// A fresh (uncached) query string per call so each test's mock binds to its own import of layout.tsx.
function importLayout(caseId: string): Promise<LayoutModule> {
  const specifier = './layout?case=' + caseId;
  return import(specifier) as Promise<LayoutModule>;
}

const eventId = new ObjectId().toHexString();
const params = Promise.resolve({ eventId });

// The layout also loads the event's theme (camera#285); the database and the loader are replaced.
function mockTheme(t: import('node:test').TestContext, background: string | null) {
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => ({}) } });
  t.mock.module('@/lib/theme/load', { namedExports: { loadEventTheme: async () => (background ? { background } : Promise.reject(new Error('no theme'))) } });
}

test('a known event publishes its manifest, the iOS web-app tags, its theme colour and full-screen viewport', async (t) => {
  t.mock.module('@/lib/events/capture-event', {
    namedExports: { loadCaptureEvent: async () => ({ name: 'Summer Fest in the Park', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR }) },
  });

  mockTheme(t, CAMERA_DEFAULT_CTA_BRAND_COLOR);
  const { generateMetadata, generateViewport } = await importLayout('known');
  const metadata = await generateMetadata({ params });
  const viewport = await generateViewport({ params });

  assert.equal(metadata.manifest, `/capture/${eventId}/manifest.webmanifest`);
  assert.deepEqual(metadata.appleWebApp, { capable: true, title: 'Summer Fest', statusBarStyle: 'default' });
  assert.equal((metadata.other as Record<string, string>)['apple-mobile-web-app-capable'], 'yes', "Apple's own tag, which iOS Safari looks for");
  assert.equal(viewport.themeColor, CAMERA_DEFAULT_CTA_BRAND_COLOR, 'the toolbar takes the page colour of the theme');
  assert.equal(viewport.viewportFit, 'cover');
});

test('when the theme cannot be loaded the toolbar keeps the brand colour', async (t) => {
  t.mock.module('@/lib/events/capture-event', { namedExports: { loadCaptureEvent: async () => ({ name: 'x', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR }) } });
  mockTheme(t, null);
  const { generateViewport } = await importLayout('no-theme');
  assert.equal((await generateViewport({ params })).themeColor, CAMERA_DEFAULT_CTA_BRAND_COLOR);
});

test('the layout never asks for a zoom lock: zoom stays the browser default outside the camera steps', async (t) => {
  t.mock.module('@/lib/events/capture-event', { namedExports: { loadCaptureEvent: async () => ({ name: 'x' }) } });
  mockTheme(t, CAMERA_DEFAULT_BRAND_COLOR);

  const { generateViewport } = await importLayout('zoom');
  const viewport = await generateViewport({ params });

  assert.equal('userScalable' in viewport, false);
  assert.equal('maximumScale' in viewport, false);
});

test('an unknown event gets no manifest link and the default theme colour', async (t) => {
  t.mock.module('@/lib/events/capture-event', { namedExports: { loadCaptureEvent: async () => null } });
  mockTheme(t, CAMERA_DEFAULT_BRAND_COLOR);

  const { generateMetadata, generateViewport } = await importLayout('unknown');

  assert.equal((await generateMetadata({ params })).manifest, undefined);
  assert.equal((await generateViewport({ params })).themeColor, CAMERA_DEFAULT_BRAND_COLOR);
});

test('a malformed event id gets a plain title and no manifest', async (t) => {
  t.mock.module('@/lib/events/capture-event', { namedExports: { loadCaptureEvent: async () => null } });

  const { generateMetadata } = await importLayout('malformed');
  const metadata = await generateMetadata({ params: Promise.resolve({ eventId: 'nope' }) });

  assert.equal(metadata.title, 'Capture');
  assert.equal(metadata.manifest, undefined);
});
