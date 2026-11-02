import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { DEFAULT_UPLOAD_MESSAGE_AREA } from '@/lib/frame/message-area';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
const libraryDbReal = await import('@/lib/library/db');
const ADMIN = { appRole: 'admin', user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin' } };

function setup(t: import('node:test').TestContext, generatedFrameEnabled = false, messageFrames: Record<string, string | string[]> = {}) {
  const eventId = new ObjectId();
  const event = {
    _id: eventId,
    eventId: 'event-uuid',
    name: 'Match day',
    partnerId: 'partner-uuid',
    frames: [],
    frameDesign: { context: {}, messages: ['Existing message'], messageFrames, messagesOverridden: false, updatedAt: 'before-upload' },
    generatedFrameEnabled,
  };
  const seeded = fakeDb({ events: [event], frames: [] });
  const generated: unknown[] = [];

  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', { exports: { ...apiReal, requireAuth: async () => ADMIN } });
  t.mock.module('@/lib/partners/authorization', {
    exports: { getPartnerScopedAccessForEvent: async () => ({ allowed: true, role: 'admin', partnerId: 'partner-uuid' }) },
  });
  t.mock.module('@/lib/library/upload', {
    exports: {
      createLibraryItem: async (db: typeof seeded.db, input: { messageArea?: unknown; owner: Record<string, unknown>; name: string }) => {
        const item = {
          frameId: 'new-frame',
          name: input.name,
          imageUrl: 'https://media.example/frame.png',
          thumbnailUrl: 'https://media.example/frame-thumb.png',
          ...input.owner,
          ...(input.messageArea ? { messageArea: input.messageArea } : {}),
          isActive: true,
        };
        await db.collection(COLLECTIONS.FRAMES).insertOne(item);
        return { ok: true as const, item };
      },
    },
  });
  t.mock.module('@/lib/library/db', { exports: { ...libraryDbReal, itemView: (_kind: string, item: unknown) => item } });
  t.mock.module('@/lib/slots/logo-store', { exports: { addLogoToEventSlot: async () => ({ ok: true, value: { slots: {} } }) } });
  t.mock.module('@/lib/frame/variants', {
    exports: {
      generateFrameVariants: async (_db: unknown, input: { frameDesign: unknown }) => {
        generated.push(input.frameDesign);
        return { design: { ...(input.frameDesign as object), variants: [{ frameId: 'new-frame' }] }, generated: 1, reused: 0 };
      },
    },
  });

  return { eventId: eventId.toHexString(), event, data: seeded.data, generated };
}

async function upload(eventId: string, testCase: string, mode = 'new', message = 'Hajrá, MTK!') {
  const form = new FormData();
  form.set('kind', 'frames');
  form.set('file', new File([new Uint8Array([137, 80, 78, 71])], 'match.png', { type: 'image/png' }));
  form.set('name', 'Match day frame');
  form.set('frameMessageMode', mode);
  form.set('frameMessage', message);
  return import(`./route?case=event-frame-upload-message-${testCase}`).then(({ POST }) => POST(
    new NextRequest(`http://localhost/api/events/${eventId}/library/upload`, { method: 'POST', body: form }),
    { params: Promise.resolve({ eventId }) },
  ));
}

test('event frame upload saves its chooser name, adds the printed message and keeps generation opt-in', async (t) => {
  const { eventId, data, generated } = setup(t, false);
  const response = await upload(eventId, 'opt-in-off');
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.data.item.name, 'Match day frame');
  assert.equal(body.data.messageSetup.status, 'needs-generation');
  assert.equal(body.data.assignment.frameId, 'new-frame');
  assert.equal(body.data.assignment.isActive, true);
  assert.equal(body.data.assignment.addedBy, 'admin-1');
  assert.deepEqual((data.events[0].frameDesign as { messages: string[] }).messages, ['Existing message', 'Hajrá, MTK!']);
  assert.deepEqual((data.events[0].frameDesign as { messageFrames: Record<string, unknown> }).messageFrames, { 'Hajrá, MTK!': 'new-frame' });
  assert.deepEqual(data.frames[0].messageArea, DEFAULT_UPLOAD_MESSAGE_AREA);
  assert.equal((data.events[0] as { generatedFrameEnabled: boolean }).generatedFrameEnabled, false);
  assert.equal(generated.length, 0, 'upload never generates or enables the default frame by itself');
});

test('an event that already opted into frame generation redraws after a message upload', async (t) => {
  const { eventId, generated } = setup(t, true);
  const response = await upload(eventId, 'opt-in-on');
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.data.messageSetup.status, 'ready');
  assert.equal(generated.length, 1);
});

test('event frame upload can select an existing printed message without replacing its other frame designs', async (t) => {
  const { eventId, data, generated } = setup(t, false, { 'Existing message': 'older-frame' });
  const response = await upload(eventId, 'select-existing', 'existing', 'Existing message');
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.data.item.name, 'Match day frame');
  assert.deepEqual((data.events[0].frameDesign as { messages: string[] }).messages, ['Existing message']);
  assert.deepEqual((data.events[0].frameDesign as { messageFrames: Record<string, unknown> }).messageFrames, { 'Existing message': ['older-frame', 'new-frame'] });
  assert.equal(data.frames[0].name, 'Match day frame', 'the chooser label stays separate from the printed message');
  assert.equal(data.frames[0].messageArea !== undefined, true);
  assert.equal(generated.length, 0);
});
