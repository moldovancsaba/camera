import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { STAGE_TOP_CLASS } from './stage-text';

const source = readFileSync('components/camera/CameraCapture.tsx', 'utf8');

/** The opening tag of the element a marker sits in: the last `<div ...>` before it, with its attributes. */
function tagBefore(marker: string): string {
  const at = source.indexOf(marker);
  assert.ok(at > 0, `${marker} is in CameraCapture.tsx`);
  const open = source.lastIndexOf('<div', at);
  return source.slice(open, source.indexOf('>', open) + 1);
}

test('the lines of text of the live stage sit at the top of the stage, in one column, never at the bottom (issue 618: the shutter covers the bottom of the stage)', () => {
  assert.match(STAGE_TOP_CLASS, /\babsolute\b/);
  assert.match(STAGE_TOP_CLASS, /\btop-\d/);
  assert.doesNotMatch(STAGE_TOP_CLASS, /\bbottom-|\binset-y|\binset-0\b/);
  assert.match(STAGE_TOP_CLASS, /\bflex-col\b/);
  assert.match(source, /<div className=\{STAGE_TOP_CLASS\} data-camera-stage-top>/);
});

test('the getting-ready line, the capture notice, the frame hint and the readout are all inside that column and carry no position of their own', () => {
  const column = source.indexOf('data-camera-stage-top>');
  const afterColumn = source.indexOf('Frame guide: dims what the frame will not keep');
  assert.ok(column > 0 && afterColumn > column);
  for (const marker of ["t('camera.gettingReady')", '{captureNotice}', "t('camera.frameGuideHint')", 'data-camera-readout']) {
    const at = source.indexOf(marker);
    assert.ok(at > column && at < afterColumn, `${marker} is inside the column`);
    const tag = tagBefore(marker);
    assert.doesNotMatch(tag, /\b(absolute|fixed|relative|bottom-|top-|inset-)/, `${marker}: its own tag has no position (${tag})`);
  }
});

test('no element of the live stage is placed at the bottom of the stage: the shutter is fixed at the bottom of the window and lies over it', () => {
  const live = source.slice(source.indexOf('{!capturedImage ? ('), source.indexOf('Captured Image Preview'));
  assert.ok(live.length > 1000);
  const bottoms = live.match(/className="[^"]*\bbottom-[^"]*"/g) ?? [];
  assert.deepEqual(bottoms, [], 'the live view has nothing positioned at the bottom');
});
