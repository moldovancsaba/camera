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

/** An event with one frame, a photo an editor uploaded, a photo already framed, and a guest's photo. */
function world(t: TestContext, options: { frames?: boolean; signedIn?: boolean; forbidden?: boolean } = {}) {
  const uploaded = new ObjectId();
  const already = new ObjectId();
  const guest = new ObjectId();
  const seeded = fakeDb({
    events: [{ _id: EVENT_ID, eventId: 'e1', name: 'MTK', frames: options.frames === false ? [] : [{ frameId: 'f1', isActive: true }] }],
    frames: [{ frameId: 'f1', name: 'Blue', imageUrl: 'https://store.test/f1.png' }],
    submissions: [
      { _id: uploaded, eventId: 'e1', eventIds: ['e1'], imageUrl: 'https://store.test/up.jpg', finalImageUrl: 'https://store.test/up.jpg', screenImageUrl: 'https://store.test/old-screen.webp', metadata: { adminGalleryUpload: true } },
      { _id: already, eventId: 'e1', eventIds: ['e1'], imageUrl: 'https://store.test/done.jpg', metadata: { adminGalleryUpload: true, galleryFrame: true } },
      { _id: guest, eventId: 'e1', eventIds: ['e1'], imageUrl: 'https://store.test/guest.jpg', metadata: {} },
    ],
  });
  const uploads: string[] = [];
  const screenFor: string[] = [];
  const forbidden = apiReal.apiForbidden('Partner-level Events manager access is required');
  t.mock.module('@/lib/api', {
    namedExports: {
      ...apiReal,
      requireAuth: async () => {
        if (options.signedIn === false) throw apiReal.apiUnauthorized();
        return { user: { id: 'u1', email: 'manager@example.test' } };
      },
    },
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      assertGlobalAdminOrPartnerEventAccess: async () => {
        if (options.forbidden) throw forbidden;
        return { role: 'manager', partnerId: 'p1' };
      },
    },
  });
  t.mock.module('@/lib/imgbb/upload', {
    namedExports: { uploadImage: async (_data: string, o: { name?: string }) => (uploads.push(o.name ?? ''), { imageUrl: `https://store.test/${o.name}.jpg`, deleteUrl: '', imageId: 'i', fileSize: 999, mimeType: 'image/jpeg' }) },
  });
  t.mock.module('@/lib/media/image-buffer', { namedExports: { fetchImageBuffer: async (url: string) => (url.includes('f1') ? frameOf() : photoOf()) } });
  t.mock.module('@/lib/submissions/screen-picture', { namedExports: { ensureScreenPicture: async (_db: unknown, s: { imageUrl: string }) => void screenFor.push(s.imageUrl) } });
  const row = (id: ObjectId) => seeded.data.submissions.find((s) => String(s._id) === String(id)) as Record<string, unknown>;
  return { seeded, uploaded, already, guest, uploads, screenFor, row };
}

const call = async (caseId: string, ids: string[]) => {
  const { POST } = await importRoute(caseId);
  return POST(new NextRequest('http://localhost/api/admin/events/x/gallery-frame', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ submissionIds: ids }) }), { params: Promise.resolve({ id: String(EVENT_ID) }) });
};

test('an uploaded photo gets the frame: the new picture replaces it, the plain upload is kept as the original, the old screen picture is dropped and made again', async (t) => {
  const w = world(t);
  const res = await call('ok', [String(w.uploaded)]);
  assert.equal(res.status, 200);
  const data = ((await res.json()) as { data: { framed: Array<{ id: string; imageUrl: string }>; skipped: unknown[] } }).data;
  assert.equal(data.framed.length, 1);
  const row = w.row(w.uploaded);
  assert.equal(row.imageUrl, data.framed[0].imageUrl);
  assert.equal(row.finalImageUrl, data.framed[0].imageUrl);
  assert.equal(row.originalImageUrl, 'https://store.test/up.jpg');
  assert.equal(row.frameId, 'f1');
  assert.equal((row.metadata as { galleryFrame: boolean }).galleryFrame, true);
  assert.deepEqual([(row.metadata as { finalWidth: number }).finalWidth, (row.metadata as { finalHeight: number }).finalHeight], [200, 250]);
  assert.equal('screenImageUrl' in row, false);
  assert.deepEqual(w.screenFor, [data.framed[0].imageUrl]);
  assert.equal(w.uploads.length, 1);
});

test('a photo that already has a frame, and a guest photo, are skipped with the reason and not touched; pressing twice does nothing the second time', async (t) => {
  const w = world(t);
  const res = await call('skip', [String(w.already), String(w.guest)]);
  const data = ((await res.json()) as { data: { framed: unknown[]; skipped: Array<{ id: string; reason: string }> } }).data;
  assert.equal(data.framed.length, 0);
  assert.deepEqual(data.skipped.map((s) => [s.id, /already has a frame|guest photos/.test(s.reason)]), [[String(w.already), true], [String(w.guest), true]]);
  assert.deepEqual([w.uploads.length, w.row(w.guest).imageUrl, w.row(w.already).imageUrl], [0, 'https://store.test/guest.jpg', 'https://store.test/done.jpg']);
});

test('an event with no frame cannot be asked, and nothing is changed', async (t) => {
  const w = world(t, { frames: false });
  const res = await call('noframe', [String(w.uploaded)]);
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /no frame yet/);
  assert.equal(w.row(w.uploaded).imageUrl, 'https://store.test/up.jpg');
});

test('not signed in, or no manager access, changes nothing; no ids, too many ids and a photo of another event are refused or skipped', async (t) => {
  const w = world(t, { signedIn: false });
  assert.equal((await call('anon', [String(w.uploaded)])).status, 401);
  assert.equal(w.uploads.length, 0);
});

test('someone without manager access to the event changes nothing', async (t) => {
  const w = world(t, { forbidden: true });
  assert.equal((await call('forbidden', [String(w.uploaded)])).status, 403);
  assert.equal(w.row(w.uploaded).imageUrl, 'https://store.test/up.jpg');
});

test('no ids, more than 25, and an id that is not a photo of this event are refused or skipped', async (t) => {
  world(t);
  assert.equal((await call('none', [])).status, 400);
  assert.equal((await call('many', Array.from({ length: 26 }, () => String(new ObjectId())))).status, 400);
  const stranger = String(new ObjectId());
  const res = await call('stranger', [stranger]);
  assert.deepEqual(((await res.json()) as { data: { skipped: Array<{ id: string; reason: string }> } }).data.skipped, [{ id: stranger, reason: 'not a photo of this event' }]);
});
