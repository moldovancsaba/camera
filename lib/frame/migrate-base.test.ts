import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { migrateBaseToLibrary, retireBase } from './migrate-base';

const NOW = '2026-10-09T08:00:00.000Z';
const BOX = { x: 520, y: 8, width: 880, height: 90 };
const LAYERS = [{ id: 'header', x: 0, y: 0, width: 1920, height: 100 }, { id: 'footer', x: 0, y: 980, width: 1920, height: 100 }];
const base = {
  images: [{ key: 'blue', imageUrl: 'https://pub.r2.dev/frames/blue.png' }, { key: 'pink', imageUrl: 'https://pub.r2.dev/frames/pink.png' }],
  messageImages: { 'MTK SZÍV!': 'pink', 'MINDEN NŐ SZÁMÍT!': 'pink' },
  messageBox: BOX,
  messageColor: CAMERA_STAGE_WHITE,
  layers: LAYERS,
};
const messages = ['HAJRÁ', 'MTK!', 'SZÍVEM KÉK-FEHÉR!', 'MTK SZÍV!', 'MINDEN NŐ SZÁMÍT!'];

function setup(extra: Record<string, unknown> = {}) {
  const _id = new ObjectId();
  const event = { _id, eventId: 'evt-uuid', partnerId: 'P', name: 'MTK x Vasas', frames: [], frameDesign: { messages, messagesOverridden: true, base, context: {}, updatedAt: NOW }, ...extra };
  const seeded = fakeDb({ frames: [], events: [event] });
  return { ...seeded, event };
}
const stored = (data: Record<string, Array<Record<string, unknown>>>) => data.events[0] as { frames: Array<{ frameId: string; isActive: boolean }>; framesOverridden?: boolean; frameDesign: { messageFrames?: Record<string, string>; base?: unknown } };

test("the pictures of the base become event frames with the same message area, assigned, and every message chooses the picture it uses today", async () => {
  const { db, data, event } = setup();
  const result = await migrateBaseToLibrary(db, event, 'admin-1', NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.frames.map((f) => [f.key, f.created]), [['blue', true], ['pink', true]]);
  assert.equal(data.frames.length, 2);
  const blue = data.frames.find((f) => f.imageUrl === base.images[0].imageUrl) as Record<string, unknown>;
  assert.equal(blue.scope, 'event');
  assert.equal(blue.eventId, 'evt-uuid');
  assert.equal(blue.partnerId, 'P');
  assert.equal(blue.isActive, true);
  assert.deepEqual(blue.messageArea, { messageBox: BOX, messageColor: CAMERA_STAGE_WHITE, layers: LAYERS });
  const e = stored(data);
  assert.deepEqual(e.frames.map((f) => f.frameId).sort(), data.frames.map((f) => String(f.frameId)).sort(), 'both are assigned to the event');
  assert.ok(e.frames.every((f) => f.isActive));
  assert.equal(e.framesOverridden, true);
  const pink = data.frames.find((f) => f.imageUrl === base.images[1].imageUrl)!.frameId;
  assert.deepEqual(e.frameDesign.messageFrames, { 'HAJRÁ': blue.frameId, 'MTK!': blue.frameId, 'SZÍVEM KÉK-FEHÉR!': blue.frameId, 'MTK SZÍV!': pink, 'MINDEN NŐ SZÁMÍT!': pink });
  assert.ok(e.frameDesign.base, 'the old data stays, so the step can be undone');
});

test('doing it twice changes nothing more: the same frames are reused and nothing is assigned twice', async () => {
  const { db, data, event } = setup();
  await migrateBaseToLibrary(db, event, 'admin-1', NOW);
  const again = await migrateBaseToLibrary(db, { ...event, frames: stored(data).frames, frameDesign: stored(data).frameDesign }, 'admin-1', NOW);
  assert.equal(again.ok && again.frames.every((f) => !f.created), true);
  assert.equal(data.frames.length, 2);
  assert.equal(stored(data).frames.length, 2);
});

test('an event without a base picture has nothing to move', async () => {
  const { db, event } = setup({ frameDesign: { messages, messagesOverridden: false, context: {}, updatedAt: NOW } });
  const result = await migrateBaseToLibrary(db, event, 'admin-1', NOW);
  assert.deepEqual([result.ok, result.ok ? 0 : result.status], [false, 400]);
});

test('the old data is removed only when every message chooses a frame that exists, is on and carries messages', async () => {
  const { db, data, event } = setup();
  const early = await retireBase(db, event, NOW);
  assert.equal(early.ok, false, 'no message chooses a frame yet');
  await migrateBaseToLibrary(db, event, 'admin-1', NOW);
  const moved = { ...event, frames: stored(data).frames, frameDesign: stored(data).frameDesign };
  // a frame switched off in the library blocks it
  const blueId = data.frames[0].frameId as string;
  await db.collection('frames').updateOne({ frameId: blueId }, { $set: { isActive: false } });
  assert.equal((await retireBase(db, moved, NOW)).ok, false);
  await db.collection('frames').updateOne({ frameId: blueId }, { $set: { isActive: true } });
  const done = await retireBase(db, moved, NOW);
  assert.equal(done.ok, true);
  assert.equal(stored(data).frameDesign.base, undefined);
  assert.ok(stored(data).frameDesign.messageFrames, 'the choices stay');
  assert.equal((await retireBase(db, { ...moved, frameDesign: stored(data).frameDesign }, NOW)).ok, false, 'nothing left to remove');
});
