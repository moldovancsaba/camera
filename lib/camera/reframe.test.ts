import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillCropRect, toFractionRect } from './reframe';

function aspect(rect: { width: number; height: number }): number {
  return rect.width / rect.height;
}

test('a frame of the same aspect keeps the whole image', () => {
  assert.deepEqual(fillCropRect(1440, 1920, 1440 / 1920), { x: 0, y: 0, width: 1440, height: 1920 });
});

test('a taller frame trims the sides and keeps the full height (3:4 camera into 9:16)', () => {
  const rect = fillCropRect(1440, 1920, 9 / 16);
  assert.equal(rect.height, 1920);
  assert.equal(rect.width, 1080);
  assert.equal(rect.x, 180);
  assert.equal(rect.y, 0);
});

test('a wider frame trims top and bottom and keeps the full width (3:4 camera into 16:9)', () => {
  const rect = fillCropRect(1440, 1920, 16 / 9);
  assert.equal(rect.width, 1440);
  assert.equal(rect.height, 810);
  assert.equal(rect.x, 0);
  assert.equal(rect.y, 555);
});

test('a square frame on a 4:3 landscape camera keeps the full height', () => {
  assert.deepEqual(fillCropRect(1920, 1440, 1), { x: 240, y: 0, width: 1440, height: 1440 });
});

test('the crop always fits inside the source, is centred, and has the requested aspect', () => {
  const sources: Array<[number, number]> = [[1440, 1920], [1920, 1440], [1080, 1920], [1920, 1080], [320, 240], [4096, 3072], [640, 641]];
  const aspects = [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9, 0.4, 2.35];
  for (const [w, h] of sources) {
    for (const a of aspects) {
      const rect = fillCropRect(w, h, a);
      assert.ok(rect.x >= 0 && rect.y >= 0, `${w}x${h} @ ${a}`);
      assert.ok(rect.x + rect.width <= w && rect.y + rect.height <= h, `${w}x${h} @ ${a} fits`);
      assert.ok(Math.abs(aspect(rect) - a) / a < 0.01, `${w}x${h} @ ${a} aspect ${aspect(rect)}`);
      assert.ok(Math.abs(rect.x - (w - rect.width - rect.x)) <= 1, `${w}x${h} @ ${a} centred horizontally`);
      assert.ok(Math.abs(rect.y - (h - rect.height - rect.y)) <= 1, `${w}x${h} @ ${a} centred vertically`);
      assert.ok(rect.width === w || rect.height === h, `${w}x${h} @ ${a} is the largest fit`);
    }
  }
});

test('invalid input falls back to something drawable instead of throwing', () => {
  assert.deepEqual(fillCropRect(0, 0, 1), { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(fillCropRect(100, 200, 0), { x: 0, y: 0, width: 100, height: 200 });
  assert.deepEqual(fillCropRect(100, 200, Number.NaN), { x: 0, y: 0, width: 100, height: 200 });
});

test('fraction rectangles describe the same area for a preview guide', () => {
  const rect = fillCropRect(1440, 1920, 9 / 16);
  const f = toFractionRect(rect, 1440, 1920);
  assert.ok(Math.abs(f.left - 0.125) < 1e-9);
  assert.equal(f.top, 0);
  assert.ok(Math.abs(f.width - 0.75) < 1e-9);
  assert.equal(f.height, 1);
});
