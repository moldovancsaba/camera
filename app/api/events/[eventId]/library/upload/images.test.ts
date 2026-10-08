import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

// The event upload route with kind=images (camera#368): the picture joins the event's library and is not assigned.
const apiReal = await import('@/lib/api');

const EVENT_MONGO_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

function setup(t: TestContext) {
  const seeded = fakeDb({ images: [], events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'Event', frames: [] }] });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', { namedExports: { getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'admin', partnerId: 'P' }) } });
  t.mock.module('@/lib/imgbb/upload', {
    namedExports: {
      uploadImage: async (file: File) => ({ success: true, imageUrl: 'https://blob.example/footer.png', thumbnailUrl: 'https://blob.example/footer.png', deleteUrl: '', imageId: '', fileSize: file.size, mimeType: file.type, fileName: file.name, provider: 'blob', mirrorImageUrl: null }),
    },
  });
  return seeded;
}

test("an image uploaded for an event is the event's own picture and is not assigned: the event document does not change", async (t) => {
  const { data, calls } = setup(t);
  const { POST } = await importRoute('ok');
  const form = new FormData();
  form.set('kind', 'images');
  form.set('name', 'Footer strip');
  form.set('file', new File([new Uint8Array([137, 80, 78, 71])], 'footer.png', { type: 'image/png' }));
  const response = await POST(new NextRequest(`http://localhost/api/events/${EVENT_MONGO_ID}/library/upload`, { method: 'POST', body: form }), { params: Promise.resolve({ eventId: String(EVENT_MONGO_ID) }) });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { data: { item: { scope: string; imageUrl: string }; assignment: unknown } };
  assert.deepEqual([body.data.item.scope, body.data.item.imageUrl, body.data.assignment], ['event', 'https://blob.example/footer.png', null]);
  const doc = data.images[0] as Record<string, unknown>;
  assert.deepEqual([doc.scope, doc.eventId, doc.partnerId], ['event', 'e-uuid', 'P']);
  assert.deepEqual(data.events[0], { _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'Event', frames: [] }, 'no images list, no override flag');
  assert.equal(calls.some((c) => c.collection === 'events'), false);
});
