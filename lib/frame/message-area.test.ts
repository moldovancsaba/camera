import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBox, parseMessageArea } from './message-area';

const BOX = { x: 520, y: 8, width: 880, height: 90 };

test('a box must sit inside the 1920 x 1080 frame and have a size', () => {
  assert.deepEqual(parseBox(BOX), BOX);
  assert.deepEqual(parseBox({ x: 0, y: 0, width: 1920, height: 1080 }), { x: 0, y: 0, width: 1920, height: 1080 });
  for (const bad of [null, undefined, 'box', {}, { ...BOX, width: 0 }, { ...BOX, x: -1 }, { ...BOX, x: 1500 }, { ...BOX, y: 1050 }, { ...BOX, height: 'a' }, { ...BOX, width: Number.NaN }]) {
    assert.equal(parseBox(bad), null, JSON.stringify(bad));
  }
});

test('a message area has a message box; the colour and the territories are optional and checked', () => {
  assert.deepEqual(parseMessageArea({ messageBox: BOX }), { messageBox: BOX });
  const full = parseMessageArea({
    messageBox: BOX,
    messageColor: '#ffffff',
    layers: [{ id: 'header', x: 0, y: 0, width: 1920, height: 100 }, { id: 'footer', x: 0, y: 980, width: 1920, height: 100 }],
    junk: 'dropped',
  });
  assert.deepEqual(full, {
    messageBox: BOX,
    messageColor: '#ffffff',
    layers: [{ id: 'header', x: 0, y: 0, width: 1920, height: 100 }, { id: 'footer', x: 0, y: 980, width: 1920, height: 100 }],
  });
  assert.deepEqual(parseMessageArea({ messageBox: BOX, messageColor: '' }), { messageBox: BOX }, 'an empty colour means the default');
});

test('an unusable message area is refused whole, so a frame never half carries messages', () => {
  for (const bad of [null, undefined, [], 'x', {}, { messageBox: { ...BOX, width: 0 } }, { messageBox: BOX, messageColor: 'white' }, { messageBox: BOX, messageColor: '#12' }]) {
    assert.equal(parseMessageArea(bad), null, JSON.stringify(bad));
  }
});

test('a territory that is not a header or a footer, or is outside the frame, is dropped; only the first four are looked at', () => {
  const area = parseMessageArea({
    messageBox: BOX,
    layers: [
      { id: 'logo', x: 0, y: 0, width: 10, height: 10 },
      { id: 'header', x: 0, y: 0, width: 5000, height: 10 },
      { id: 'header', x: 0, y: 0, width: 1920, height: 100 },
      { id: 'footer', x: 0, y: 980, width: 1920, height: 100 },
      { id: 'footer', x: 0, y: 900, width: 100, height: 100 },
    ],
  });
  assert.deepEqual(area?.layers?.map((l) => l.id), ['header', 'footer'], 'the first two candidates are not usable; the fifth is not looked at');
});
