import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectId } from 'mongodb';
import { DEFAULT_FRAME_MESSAGES } from './messages';
import { fakeDb } from '@/lib/library/fake-db';
import { DEFAULT_UPLOAD_MESSAGE_AREA } from './message-area';
import { associateUploadedFrameMessage, prepareUploadMessage } from './upload-message';

test('event frame upload can reuse a current message and preserves existing frame choices', () => {
  const result = prepareUploadMessage('existing', 'Go!', ['Go!', 'MTK!'], { 'Go!': 'frame-one' });
  assert.deepEqual(result, {
    mode: 'existing',
    messages: ['Go!', 'MTK!'],
    messageFrames: { 'Go!': ['frame-one', '__uploading_frame__'] },
    message: 'Go!',
  });
});

test('event frame upload can add a valid new message to the current list', () => {
  const result = prepareUploadMessage('new', '  Hajrá, {partner1}!  ', [...DEFAULT_FRAME_MESSAGES], undefined);
  assert.equal(result?.message, 'Hajrá, {partner1}!');
  assert.equal(result?.messages.at(-1), 'Hajrá, {partner1}!');
  assert.equal(result?.messageFrames['Hajrá, {partner1}!'], '__uploading_frame__');
});

test('no message leaves an ordinary complete frame upload unchanged', () => {
  assert.equal(prepareUploadMessage('none', '', [...DEFAULT_FRAME_MESSAGES], undefined), null);
});

test('event frame upload refuses stale selection, duplicate new message, and invalid placeholders', () => {
  assert.throws(() => prepareUploadMessage('existing', 'Gone', ['Here'], undefined), (error: unknown) => error instanceof Response && error.status === 400);
  assert.throws(() => prepareUploadMessage('new', 'Here', ['Here'], undefined), (error: unknown) => error instanceof Response && error.status === 400);
  assert.throws(() => prepareUploadMessage('new', 'Hello {unknown}', [], undefined), (error: unknown) => error instanceof Response && error.status === 400);
});

function associationFixture(messages = ['Go!'], messageFrames: Record<string, string | string[]> = {}) {
  const eventId = new ObjectId();
  const event = {
    _id: eventId,
    eventId: 'event-uuid',
    frames: [{ frameId: 'new-frame', isActive: true }],
    frameDesign: {
      context: {},
      messages,
      messagesOverridden: false,
      messageFrames,
      updatedAt: 'before-upload',
    },
  };
  const seeded = fakeDb({
    events: [event],
    frames: [{
      frameId: 'new-frame',
      name: 'Match day',
      imageUrl: 'https://media.example/frame.png',
      scope: 'event',
      eventId: 'event-uuid',
      isActive: true,
      messageArea: DEFAULT_UPLOAD_MESSAGE_AREA,
    }],
  });
  return { ...seeded, event };
}

test('upload association adds the new frame to an existing message without dropping prior designs', async () => {
  const { db, data, event } = associationFixture(['Go!'], { 'Go!': 'older-frame' });
  const prepared = prepareUploadMessage('existing', 'Go!', ['Go!'], { 'Go!': 'older-frame' });
  assert.ok(prepared);

  const design = await associateUploadedFrameMessage(db, event, 'new-frame', prepared);

  assert.deepEqual(design.messageFrames, { 'Go!': ['older-frame', 'new-frame'] });
  assert.deepEqual((data.events[0].frameDesign as { messageFrames: unknown }).messageFrames, design.messageFrames);
  assert.deepEqual((data.events[0].frames as unknown[]).length, 1);
});

test('upload association persists a newly added event message and links its frame', async () => {
  const { db, data, event } = associationFixture(['Go!']);
  const prepared = prepareUploadMessage('new', 'Hajrá!', ['Go!'], undefined);
  assert.ok(prepared);

  const design = await associateUploadedFrameMessage(db, event, 'new-frame', prepared);

  assert.deepEqual(design.messages, ['Go!', 'Hajrá!']);
  assert.deepEqual(design.messageFrames, { 'Hajrá!': 'new-frame' });
  assert.deepEqual((data.events[0].frameDesign as { messages: unknown }).messages, design.messages);
});

test('upload association refuses a frame that is inactive or does not carry a message area', async () => {
  for (const [caseId, frameUpdate] of [
    ['inactive', { isActive: false, messageArea: DEFAULT_UPLOAD_MESSAGE_AREA }],
    ['no-message-area', { isActive: true, messageArea: undefined }],
  ] as const) {
    const { db, event } = associationFixture();
    await db.collection('frames').updateOne({ frameId: 'new-frame' }, { $set: frameUpdate });
    const prepared = prepareUploadMessage('existing', 'Go!', ['Go!'], undefined);
    assert.ok(prepared);
    await assert.rejects(associateUploadedFrameMessage(db, event, 'new-frame', prepared), (error: unknown) => error instanceof Response && error.status === 400, caseId);
  }
});
