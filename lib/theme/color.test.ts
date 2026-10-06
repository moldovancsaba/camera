import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrast, isDark, opaque, parseColour, readable } from './color';

test('hex colours of every length parse, anything else does not', () => {
  assert.deepEqual(parseColour('#fff'), { rgb: { r: 255, g: 255, b: 255 }, alpha: 1 });
  assert.deepEqual(parseColour('#1f2937'), { rgb: { r: 31, g: 41, b: 55 }, alpha: 1 });
  assert.equal(parseColour('#00000080')?.alpha.toFixed(2), '0.50');
  for (const bad of ['red', 'rgb(0,0,0)', '#12', '#1234567', '', null, undefined, 5]) assert.equal(parseColour(bad), null, String(bad));
});

test('a transparent colour is flattened onto the background', () => {
  assert.equal(opaque('#000000ff'), '#000000');
  assert.equal(opaque('#00000000'), '#ffffff');
  assert.equal(opaque('#00000080'), '#7f7f7f');
  assert.equal(opaque('#ffffff80', { r: 0, g: 0, b: 0 }), '#808080');
  assert.equal(opaque('nope'), null);
});

test('contrast follows WCAG', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrast('#ffffff', '#ffffff').toFixed(1), '1.0');
  assert.ok(contrast('#767676', '#ffffff') >= 4.5 && contrast('#777777', '#ffffff') < 4.6);
  assert.equal(contrast('x', '#ffffff'), 1);
});

test('text that cannot be read is replaced by white or black, whichever reads better', () => {
  assert.equal(readable('#111827', '#ffffff'), '#111827');
  assert.equal(readable('#e5e7eb', '#ffffff'), '#000000');
  assert.equal(readable('#1f2937', '#171d37'), '#ffffff');
  assert.equal(readable(null, '#171d37'), '#ffffff');
  assert.equal(readable('#e5e5e5', '#777777', 3), '#e5e5e5', 'a looser ratio is used where the caller asks for it');
});

test('dark and light backgrounds are told apart', () => {
  assert.equal(isDark('#171d37'), true);
  assert.equal(isDark('#f8fafc'), false);
});
