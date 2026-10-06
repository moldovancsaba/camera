import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCapturePhotoSteps } from './captureTourSteps';

test('on a touch device the photo tour points at the Take photo button, not at a live shutter that is not there', () => {
  const steps = getCapturePhotoSteps({ hasMultipleFrames: false, method: 'system' });
  assert.deepEqual(steps.map((s) => s.id), ['capture-take-photo']);
  assert.equal(steps[0].targetSelector, '[aria-label="Take photo"]');
});

test('with a live camera the tour keeps the shutter and the camera switch, and a frame step when there are several frames', () => {
  for (const method of [undefined, null, 'still', 'frame'] as const) {
    assert.deepEqual(getCapturePhotoSteps({ hasMultipleFrames: false, method }).map((s) => s.id), ['capture-shutter', 'capture-switch-camera']);
  }
  assert.deepEqual(getCapturePhotoSteps({ hasMultipleFrames: true, method: 'frame' }).map((s) => s.id), ['capture-shutter', 'capture-switch-camera', 'capture-change-frame']);
  assert.deepEqual(getCapturePhotoSteps({ hasMultipleFrames: true, method: 'system' }).map((s) => s.id), ['capture-take-photo', 'capture-change-frame']);
});
