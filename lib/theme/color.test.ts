import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestOfWhiteOrBlack, contrast, isDark, opaque, parseColour, readable, repaired } from './color';

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

test('text that reads is kept; text that does not is repaired, not replaced: the same hue, darker or lighter', () => {
  assert.equal(readable('#111827', '#ffffff'), '#111827');
  assert.equal(readable('#e5e5e5', '#777777', 3), '#e5e5e5', 'a looser ratio is used where the caller asks for it');
  // The MTK x Vasas case (camera#336): navy text on the page blue was 3.66:1, so it fell back to black; now it is the navy made 20% darker.
  assert.equal(readable('#004c87', '#00b5e4'), '#003d6c');
  assert.ok(contrast('#003d6c', '#00b5e4') >= 4.5);
  // A near-white text on white becomes a grey of the same (neutral) hue, not black.
  const grey = readable('#e5e7eb', '#ffffff');
  assert.ok(contrast(grey, '#ffffff') >= 4.5 && grey !== '#000000');
  // On a dark page a dark text is made lighter, keeping its (blue-ish) hue.
  const lighter = readable('#1f2937', '#171d37');
  assert.ok(contrast(lighter, '#171d37') >= 4.5);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(lighter.slice(i, i + 2), 16));
  assert.ok(b > r && b >= g, 'still bluish');
});

test('only when no variant of a colour can read is white or black used, whichever reads better', () => {
  assert.equal(readable(null, '#171d37'), '#ffffff');
  assert.equal(readable(null, '#ffffff'), '#000000');
  assert.equal(readable('not a colour', '#ffffff'), '#000000');
  // Mid grey on mid grey: no shade of it reaches 7:1 against its own background in either direction within the steps.
  assert.equal(repaired('#808080', ['#808080'], 21), null);
  assert.equal(readable('#808080', '#808080', 21), '#000000');
});

test('repaired() keeps a passing colour, changes the least, and tests every background', () => {
  assert.equal(repaired('#111827', ['#ffffff']), '#111827');
  assert.equal(repaired('#00b5e4', ['#ffffff', '#00b5e4'], 3) !== null, true, 'a colour can be made to stand out from the page it is the colour of');
  const both = repaired('#ffffff', ['#ffffff', '#00b5e4'], 3);
  assert.ok(both && contrast(both, '#ffffff') >= 3 && contrast(both, '#00b5e4') >= 3, 'white is made to stand out from a white card and a blue page');
  assert.equal(repaired('x', ['#ffffff']), null);
  assert.equal(bestOfWhiteOrBlack(['#ffffff', '#00b5e4']), '#000000');
});

test('dark and light backgrounds are told apart', () => {
  assert.equal(isDark('#171d37'), true);
  assert.equal(isDark('#f8fafc'), false);
});
