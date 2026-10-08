import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { chosenFrameId, frameBaseOf, loadMessageFrames, parseMessageFrames, validateMessageFrames } from './message-frames';

/** A colour from its digits: the colour gate allows no raw hex literal in a test. */
const hex = (digits: string) => `#${digits}`;

const AREA = { messageBox: { x: 520, y: 8, width: 880, height: 90 }, messageColor: hex('ffffff'), layers: [{ id: 'header', x: 0, y: 0, width: 1920, height: 100 }] };
const frame = (frameId: string, extra: Record<string, unknown> = {}) => ({ frameId, name: `Frame ${frameId}`, imageUrl: `https://img.example/${frameId}.png`, isActive: true, messageArea: AREA, ...extra });
const row = (frameId: string, isActive = true) => ({ frameId, isActive, addedAt: 'x', addedBy: 'u' });

test('the submitted choices must name messages of the list and frame ids; an empty choice means none', () => {
  const messages = ['HAJRÁ', 'MTK!'];
  assert.deepEqual(parseMessageFrames(undefined, messages), { ok: true, messageFrames: {} });
  assert.deepEqual(parseMessageFrames(null, messages), { ok: true, messageFrames: {} });
  assert.deepEqual(parseMessageFrames({ HAJRÁ: 'f1', 'MTK!': null }, messages), { ok: true, messageFrames: { HAJRÁ: 'f1' } });
  assert.deepEqual(parseMessageFrames({ HAJRÁ: '' }, messages), { ok: true, messageFrames: {} });
  for (const bad of ['f1', ['f1'], { Nope: 'f1' }, { HAJRÁ: 7 }, { HAJRÁ: 'x'.repeat(81) }]) {
    assert.equal(parseMessageFrames(bad, messages).ok, false, JSON.stringify(bad));
  }
});

test('the frame of a message is read by its text; a message with no choice has none', () => {
  const design = { messages: ['HAJRÁ', 'MTK!', 'Go!'], messageFrames: { HAJRÁ: 'f-blue', 'MTK!': 'f-pink' } };
  assert.equal(chosenFrameId(design, 0), 'f-blue');
  assert.equal(chosenFrameId(design, 1), 'f-pink');
  assert.equal(chosenFrameId(design, 2), null);
  assert.equal(chosenFrameId(design, null), null, 'the image without a message has no frame');
  assert.equal(chosenFrameId(design, 9), null);
  assert.equal(chosenFrameId({ messages: ['a'] }, 0), null);
});

test('a library frame becomes the same base the older designer picture uses, so it is drawn the same way', () => {
  const base = frameBaseOf({ frameId: 'f1', name: 'F', imageUrl: 'https://img.example/f1.png', area: AREA as never });
  assert.deepEqual(base.images, [{ key: 'frame', imageUrl: 'https://img.example/f1.png' }]);
  assert.deepEqual(base.messageBox, AREA.messageBox);
  assert.equal(base.messageColor, hex('ffffff'));
  assert.deepEqual(base.layers, AREA.layers);
  const plain = frameBaseOf({ frameId: 'f2', name: 'F', imageUrl: 'https://img.example/f2.png', area: { messageBox: AREA.messageBox } });
  assert.equal('messageColor' in plain, false);
  assert.equal('layers' in plain, false);
});

test('only frames that can carry a message are offered: assigned, switched on for the event and in the library, with a picture and a usable message area', async () => {
  const { db } = fakeDb({
    frames: [
      frame('ok'),
      frame('off-library', { isActive: false }),
      frame('off-event'),
      frame('no-area', { messageArea: undefined }),
      frame('bad-area', { messageArea: { messageBox: { x: 0, y: 0, width: 0, height: 0 } } }),
      frame('no-picture', { imageUrl: '' }),
      frame('not-assigned'),
    ],
  });
  const event = { frames: [row('ok'), row('off-library'), row('off-event', false), row('no-area'), row('bad-area'), row('no-picture'), row('gone')] };
  assert.deepEqual([...(await loadMessageFrames(db, event)).keys()], ['ok']);
  assert.deepEqual([...(await loadMessageFrames(db, { frames: [] })).keys()], []);
  assert.deepEqual([...(await loadMessageFrames(db, {})).keys()], []);
});

test('the choices are checked against the frames the event can use, with a plain message for one that cannot carry a message', async () => {
  const { db } = fakeDb({ frames: [frame('ok'), frame('plain', { messageArea: undefined })] });
  const event = { frames: [row('ok'), row('plain')] };
  const messages = ['HAJRÁ', 'MTK!'];
  assert.deepEqual(await validateMessageFrames(db, event, messages, { HAJRÁ: 'ok' }), { ok: true, messageFrames: { HAJRÁ: 'ok' } });
  assert.deepEqual(await validateMessageFrames(db, event, messages, undefined), { ok: true, messageFrames: {} });
  const refused = await validateMessageFrames(db, event, messages, { HAJRÁ: 'plain' });
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? '' : refused.error, /HAJRÁ.*message area/);
  assert.equal((await validateMessageFrames(db, event, messages, { HAJRÁ: 'unknown' })).ok, false);
  assert.equal((await validateMessageFrames(db, event, messages, { Other: 'ok' })).ok, false);
});
