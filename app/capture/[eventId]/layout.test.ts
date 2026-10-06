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

test('a known event publishes its manifest, the iOS web-app tags, its theme colour and full-screen viewport', async (t) => {
  t.mock.module('@/lib/events/capture-event', {
    namedExports: { loadCaptureEvent: async () => ({ name: 'Summer Fest in the Park', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR }) },
  });

  const { generateMetadata, generateViewport } = await importLayout('known');
  const metadata = await generateMetadata({ params });
  const viewport = await generateViewport({ params });

  assert.equal(metadata.manifest, `/capture/${eventId}/manifest.webmanifest`);
  assert.deepEqual(metadata.appleWebApp, { capable: true, title: 'Summer Fest', statusBarStyle: 'default' });
  assert.equal(viewport.themeColor, CAMERA_DEFAULT_CTA_BRAND_COLOR);
  assert.equal(viewport.viewportFit, 'cover');
});

test('the layout never asks for a zoom lock: zoom stays the browser default outside the camera steps', async (t) => {
  t.mock.module('@/lib/events/capture-event', { namedExports: { loadCaptureEvent: async () => ({ name: 'x' }) } });

  const { generateViewport } = await importLayout('zoom');
  const viewport = await generateViewport({ params });

  assert.equal('userScalable' in viewport, false);
  assert.equal('maximumScale' in viewport, false);
});

test('an unknown event gets no manifest link and the default theme colour', async (t) => {
  t.mock.module('@/lib/events/capture-event', { namedExports: { loadCaptureEvent: async () => null } });

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
