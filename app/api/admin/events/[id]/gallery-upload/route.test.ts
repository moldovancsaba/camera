import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const EVENT_ID = new ObjectId();
const photoOf = () => sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 20, g: 120, b: 200 } } }).png().toBuffer();
const frameOf = () => sharp({ create: { width: 200, height: 250, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.5 } } }).png().toBuffer();

function world(t: TestContext, options: { frames?: boolean; frameFetchFails?: boolean } = {}) {
  const seeded = fakeDb({
    events: [{ _id: EVENT_ID, eventId: 'e1', name: 'MTK', partnerId: 'p1', frames: options.frames === false ? [] : [{ frameId: 'f1', isActive: true }] }],
    partners: [{ partnerId: 'p1', name: 'MTK Budapest' }],
    frames: [{ frameId: 'f1', name: 'Blue', imageUrl: 'https://store.test/f1.png' }],
    submissions: [],
  });
  const uploads: string[] = [];
  const screenFor: string[] = [];
  t.mock.module('@/lib/api', {
    namedExports: { ...apiReal, requireAuth: async () => ({ user: { id: 'u1', email: 'manager@example.test', name: 'Mia' } }), checkRateLimit: async () => undefined },
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { assertGlobalAdminOrPartnerEventAccess: async () => ({ role: 'manager', partnerId: 'p1' }) } });
  t.mock.module('@/lib/imgbb/upload', {
    namedExports: { uploadImage: async (_data: string, o: { name?: string }) => (uploads.push(o.name ?? ''), { imageUrl: `https://store.test/${o.name}.jpg`, deleteUrl: '', imageId: 'i', fileSize: 999, mimeType: 'image/png' }) },
  });
  t.mock.module('@/lib/media/image-buffer', {
    namedExports: {
      fetchImageBuffer: async (url: string) => {
        if (options.frameFetchFails) throw new Error('the frame is gone');
        return url.includes('f1') ? frameOf() : photoOf();
      },
    },
  });
  t.mock.module('@/lib/submissions/screen-picture', { namedExports: { ensureScreenPicture: async (_db: unknown, s: { imageUrl: string }) => void screenFor.push(s.imageUrl) } });
  return { seeded, uploads, screenFor };
}

const post = async (caseId: string, withFrame: boolean) => {
  const { POST } = await importRoute(caseId);
  const form = new FormData();
  form.append('file', new File([new Uint8Array(await photoOf())], 'a.png', { type: 'image/png' }));
  form.append('imageWidth', '600');
  form.append('imageHeight', '400');
  if (withFrame) form.append('withFrame', '1');
  const res = await POST(new NextRequest('http://localhost/api/admin/events/x/gallery-upload', { method: 'POST', body: form }), { params: Promise.resolve({ id: String(EVENT_ID) }) });
  return { status: res.status, data: ((await res.json()) as { data: { submission: Record<string, unknown>; framed: boolean; frameNote: string | null } }).data };
};

test('without the option the photo is added as before: no frame, one upload, its own size', async (t) => {
  const w = world(t);
  const { status, data } = await post('plain', false);
  assert.equal(status, 201);
  assert.equal(data.framed, false);
  assert.equal(data.submission.frameId, null);
  assert.equal('originalImageUrl' in data.submission, false);
  assert.deepEqual([w.uploads.length, (data.submission.metadata as { finalWidth: number }).finalWidth, 'galleryFrame' in (data.submission.metadata as object)], [1, 600, false]);
  assert.deepEqual(w.screenFor, [data.submission.imageUrl], 'the screen-sized picture is scheduled for it');
});

test('with the option the photo is cropped to the frame and framed: the picture is the framed one, the plain upload is the original, the frame is recorded', async (t) => {
  const w = world(t);
  const { data } = await post('framed', true);
  assert.equal(data.framed, true);
  assert.equal(data.frameNote, null);
  assert.equal(w.uploads.length, 2, 'the plain upload and the framed picture');
  assert.match(String(data.submission.imageUrl), /admin-gallery-framed-/);
  assert.match(String(data.submission.originalImageUrl), /admin-gallery-e1-/);
  assert.equal(data.submission.frameId, 'f1');
  assert.deepEqual([(data.submission.metadata as { finalWidth: number }).finalWidth, (data.submission.metadata as { finalHeight: number }).finalHeight, (data.submission.metadata as { galleryFrame: boolean }).galleryFrame], [200, 250, true]);
  assert.deepEqual(w.screenFor, [data.submission.imageUrl]);
});

test('an event with no frame adds the photo without one and says so', async (t) => {
  world(t, { frames: false });
  const { status, data } = await post('noframe', true);
  assert.equal(status, 201);
  assert.equal(data.framed, false);
  assert.match(String(data.frameNote), /no frame yet/);
});

test('when the frame cannot be fetched the photo is still added, unframed, and the answer says so', async (t) => {
  const w = world(t, { frameFetchFails: true });
  const { status, data } = await post('broken', true);
  assert.equal(status, 201);
  assert.equal(data.framed, false);
  assert.match(String(data.frameNote), /could not be added/);
  assert.equal(w.uploads.length, 1);
});
