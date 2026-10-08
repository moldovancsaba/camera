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

function setup(t: TestContext, options: { allowed?: boolean } = {}) {
  const seeded = fakeDb({
    frames: [],
    events: [{ _id: EVENT_MONGO_ID, eventId: 'e-uuid', partnerId: 'P', name: 'Event', frames: [] }],
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
  assert.equal((await POST(post({ kind: 'logos', name: 'x' }, png()), params)).status, 400);
  assert.deepEqual(stored, []);
  assert.deepEqual((data.events[0] as { frames: unknown[] }).frames, []);
  assert.equal((data.events[0] as { framesOverridden?: boolean }).framesOverridden, undefined);
});

test('without manager access to the event nothing is uploaded', async (t) => {
  const { data, stored } = setup(t, { allowed: false });
  const { POST } = await importRoute('denied');
  assert.equal((await POST(post({ kind: 'frames', name: 'x' }, png()), params)).status, 403);
  assert.deepEqual(stored, []);
  assert.equal(data.frames.length, 0);
});
