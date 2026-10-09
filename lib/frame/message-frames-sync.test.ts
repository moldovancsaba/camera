import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { nativeFrameContext, type FrameDesign } from './context';
import { refreshFrameDesign, saveFrameMessages, type RefreshDeps } from './sync';

const NOW = '2026-10-08T12:00:00.000Z';
const AREA = { messageBox: { x: 520, y: 8, width: 880, height: 90 } };
const frame = (frameId: string, extra: Record<string, unknown> = {}) => ({ frameId, name: `Frame ${frameId}`, imageUrl: `https://i.ibb.co/${frameId}.png`, isActive: true, messageArea: AREA, ...extra });
const row = (frameId: string, isActive = true) => ({ frameId, isActive, addedAt: 'x', addedBy: 'u' });
const deps: RefreshDeps = { fetchContext: async () => null, messmassConfigured: () => false, now: () => NOW };

function setup(design: Partial<FrameDesign> = {}) {
  const context = nativeFrameContext({ eventName: 'MTK x Vasas', partnerName: 'MTK', partnerLogoUrl: null }, NOW);
  const frameDesign: FrameDesign = { context: { ...context, style: { ...context.style, headingColor: `${CAMERA_STAGE_WHITE}FF` } }, messages: ['HAJRÁ', 'MTK!', 'Go!'], messagesOverridden: true, updatedAt: NOW, ...design };
  const _id = new ObjectId();
  const event = { _id, eventId: 'evt', partnerId: 'P', frames: [row('f-blue'), row('f-pink'), row('f-plain'), row('f-off', false)], frameDesign };
  const seeded = fakeDb({ frames: [frame('f-blue'), frame('f-pink'), frame('f-plain', { messageArea: undefined }), frame('f-off')], events: [event], partners: [{ partnerId: 'P', name: 'MTK' }] });
  return { ...seeded, event, _id };
}
const stored = (data: Record<string, Array<Record<string, unknown>>>) => (data.events[0].frameDesign as FrameDesign);

test('the frames of the messages are saved with the messages, by the text of each message', async () => {
  const { db, data, event } = setup();
  const design = await saveFrameMessages(db, event, { messages: ['HAJRÁ', 'MTK!', 'Go!'], messageFrames: { HAJRÁ: 'f-blue', 'MTK!': 'f-pink' } }, deps);
  assert.deepEqual(design.messageFrames, { HAJRÁ: 'f-blue', 'MTK!': 'f-pink' });
  assert.deepEqual(stored(data).messageFrames, { HAJRÁ: 'f-blue', 'MTK!': 'f-pink' });
});

test('a choice is refused with a plain 400 when the frame is not assigned, switched off, has no message area, or the message is not in the list', async () => {
  const { db, data, event } = setup();
  const refused = (input: Record<string, unknown>) => assert.rejects(saveFrameMessages(db, event, { messages: ['HAJRÁ', 'MTK!'], ...input }, deps), (error: unknown) => error instanceof Response && error.status === 400);
  await refused({ messageFrames: { HAJRÁ: 'f-plain' } });
  await refused({ messageFrames: { HAJRÁ: 'f-off' } });
  await refused({ messageFrames: { HAJRÁ: 'nope' } });
  await refused({ messageFrames: { 'Not in the list': 'f-blue' } });
  assert.equal(stored(data).messageFrames, undefined, 'a refused save writes nothing');
});

test('saving only the messages keeps the choices of the messages that are still there and drops the choices of a message that went', async () => {
  const { db, data, event } = setup({ messageFrames: { HAJRÁ: 'f-blue', 'MTK!': 'f-pink' } });
  const design = await saveFrameMessages(db, event, { messages: ['HAJRÁ', 'New message'] }, deps);
  assert.deepEqual(design.messageFrames, { HAJRÁ: 'f-blue' });
  assert.deepEqual(stored(data).messageFrames, { HAJRÁ: 'f-blue' });
  const none = await saveFrameMessages(db, { ...event, frameDesign: stored(data) }, { messages: ['Only new'] }, deps);
  assert.equal(none.messageFrames, undefined);
  assert.equal(stored(data).messageFrames, undefined, 'no choice is left over');
});

test('a message edited in place keeps its frame only when the editor sends the choice with it', async () => {
  const { db, event } = setup({ messageFrames: { HAJRÁ: 'f-blue' } });
  const kept = await saveFrameMessages(db, event, { messages: ['HAJRÁ!!'], messageFrames: { 'HAJRÁ!!': 'f-blue' } }, deps);
  assert.deepEqual(kept.messageFrames, { 'HAJRÁ!!': 'f-blue' });
});

test('resetting the messages clears the frames of the messages too', async () => {
  const { db, data, event } = setup({ messageFrames: { HAJRÁ: 'f-blue' } });
  const design = await saveFrameMessages(db, event, { reset: true }, deps);
  assert.equal(design.messageFrames, undefined);
  assert.equal(stored(data).messageFrames, undefined);
});

test('a new snapshot keeps the frames of the messages', async () => {
  const { db, data, event } = setup({ messageFrames: { HAJRÁ: 'f-blue' } });
  const result = await refreshFrameDesign(db, event, deps);
  assert.deepEqual(result.design.messageFrames, { HAJRÁ: 'f-blue' });
  assert.deepEqual(stored(data).messageFrames, { HAJRÁ: 'f-blue' });
});

test('a message on several designs is saved as a list, a single design stays a plain id, and a design that is not usable refuses the whole save (issue 449)', async () => {
  const { db, data, event } = setup();
  const design = await saveFrameMessages(db, event, { messages: ['HAJRÁ', 'MTK!', 'Go!'], messageFrames: { HAJRÁ: ['f-blue', 'f-pink'], 'MTK!': ['f-pink'], 'Go!': [] } }, deps);
  assert.deepEqual(design.messageFrames, { HAJRÁ: ['f-blue', 'f-pink'], 'MTK!': 'f-pink' });
  assert.deepEqual(stored(data).messageFrames, { HAJRÁ: ['f-blue', 'f-pink'], 'MTK!': 'f-pink' });
  await assert.rejects(
    saveFrameMessages(db, event, { messages: ['HAJRÁ'], messageFrames: { HAJRÁ: ['f-blue', 'f-off'] } }, deps),
    (error: unknown) => error instanceof Response && error.status === 400
  );
  assert.deepEqual(stored(data).messageFrames, { HAJRÁ: ['f-blue', 'f-pink'], 'MTK!': 'f-pink' }, 'a refused save writes nothing');
});

test('saving only the messages keeps the list of designs of a message that stays', async () => {
  const { db, data, event } = setup({ messageFrames: { HAJRÁ: ['f-blue', 'f-pink'], 'MTK!': 'f-pink' } });
  const design = await saveFrameMessages(db, event, { messages: ['HAJRÁ', 'New'] }, deps);
  assert.deepEqual(design.messageFrames, { HAJRÁ: ['f-blue', 'f-pink'] });
  assert.deepEqual(stored(data).messageFrames, { HAJRÁ: ['f-blue', 'f-pink'] });
});

test('where the dark area of the designs comes from is saved with the messages, refused when it is not one of the two, kept on a snapshot refresh and cleared by a reset', async () => {
  const { db, data, event } = setup({ messageFrames: { HAJRÁ: 'f-blue' } });
  const saved = await saveFrameMessages(db, event, { messages: ['HAJRÁ', 'MTK!', 'Go!'], darkArea: 'generated' }, deps);
  assert.equal(saved.darkArea, 'generated');
  assert.equal(stored(data).darkArea, 'generated');
  assert.deepEqual(saved.messageFrames, { HAJRÁ: 'f-blue' }, 'the designs of the messages stay');

  const kept = await saveFrameMessages(db, { ...event, frameDesign: stored(data) }, { messages: ['HAJRÁ', 'MTK!', 'Go!'] }, deps);
  assert.equal(kept.darkArea, 'generated', 'saving only the messages keeps it');

  await assert.rejects(saveFrameMessages(db, { ...event, frameDesign: stored(data) }, { messages: ['HAJRÁ'], darkArea: 'sideways' }, deps), (error: unknown) => error instanceof Response && error.status === 400);
  assert.equal(stored(data).darkArea, 'generated', 'a refused save writes nothing');

  const own = await saveFrameMessages(db, { ...event, frameDesign: stored(data) }, { messages: ['HAJRÁ'], darkArea: 'frame' }, deps);
  assert.equal(own.darkArea, undefined);
  assert.equal(stored(data).darkArea, undefined, 'the default stores nothing');

  await saveFrameMessages(db, { ...event, frameDesign: stored(data) }, { messages: ['HAJRÁ'], darkArea: 'generated' }, deps);
  const refreshed = await refreshFrameDesign(db, { ...event, frameDesign: stored(data) }, { ...deps, messmassConfigured: () => false });
  assert.equal(refreshed.design.darkArea, 'generated', 'a snapshot refresh keeps it');
  const reset = await saveFrameMessages(db, { ...event, frameDesign: stored(data) }, { reset: true }, deps);
  assert.equal(reset.darkArea, undefined, 'a reset clears it with the designs');
});
