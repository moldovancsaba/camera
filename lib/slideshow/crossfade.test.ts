import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crossfadeEnabled } from './crossfade';

/** What the player did before the query existed: only the slideshow's own setting, and only an explicit `true`. */
const before = (setting: boolean | undefined) => setting === true;

test('without the query the setting decides, exactly as before (off unless the slideshow says true)', () => {
  const settings: Array<boolean | undefined> = [undefined, false, true];
  const addresses = ['', '?', '?debug=1', '?debug=1&x=2', '?crossfade', '?crossfade=', '?crossfade=2', '?crossfade=true', '?crossfade=yes', '?Crossfade=1', '?crossfade%5B%5D=1', '?other=crossfade=1'];
  for (const setting of settings) {
    for (const search of addresses) {
      assert.equal(crossfadeEnabled(setting, search), before(setting), `setting ${String(setting)} with "${search}"`);
    }
  }
});

test('a slideshow that never heard of the switch is off', () => {
  assert.equal(crossfadeEnabled(undefined, ''), false);
});

test('?crossfade=1 turns it on for that page, whatever the setting says', () => {
  for (const setting of [undefined, false, true]) {
    assert.equal(crossfadeEnabled(setting, '?crossfade=1'), true);
    assert.equal(crossfadeEnabled(setting, 'crossfade=1'), true, 'the question mark is optional');
    assert.equal(crossfadeEnabled(setting, '?debug=1&crossfade=1'), true, 'it works beside the debug panel');
  }
});

test('?crossfade=0 turns it off for that page, whatever the setting says', () => {
  for (const setting of [undefined, false, true]) {
    assert.equal(crossfadeEnabled(setting, '?crossfade=0'), false);
    assert.equal(crossfadeEnabled(setting, '?debug=1&crossfade=0'), false);
  }
});

test('only 1 and 0 count: any other value leaves the setting alone', () => {
  assert.equal(crossfadeEnabled(false, '?crossfade=true'), false);
  assert.equal(crossfadeEnabled(true, '?crossfade=false'), true);
  assert.equal(crossfadeEnabled(false, '?crossfade='), false);
});
