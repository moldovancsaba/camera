import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCapturePhotoSteps } from './captureTourSteps';

test('on a touch device the photo tour points at the Take photo button, not at a live shutter that is not there', () => {
  const steps = getCapturePhotoSteps({ hasMultipleFrames: false, method: 'system' });
  assert.deepEqual(steps.map((s) => s.id), ['capture-take-photo']);
  assert.equal(steps[0].targetSelector, '[data-tour-id="capture-take-photo"]');
});

test('with a live camera the tour keeps the shutter and the camera switch, and a frame step when there are several frames', () => {
  for (const method of [undefined, null, 'still', 'frame'] as const) {
    assert.deepEqual(getCapturePhotoSteps({ hasMultipleFrames: false, method }).map((s) => s.id), ['capture-shutter', 'capture-switch-camera']);
  }
  assert.deepEqual(getCapturePhotoSteps({ hasMultipleFrames: true, method: 'frame' }).map((s) => s.id), ['capture-shutter', 'capture-switch-camera', 'capture-change-frame']);
  assert.deepEqual(getCapturePhotoSteps({ hasMultipleFrames: true, method: 'system' }).map((s) => s.id), ['capture-take-photo', 'capture-change-frame']);
});

test('the tour points at data attributes, not at texts, so translating a label cannot lose a step; its words follow the language', () => {
  for (const method of ['system', 'frame'] as const) {
    for (const step of getCapturePhotoSteps({ hasMultipleFrames: true, method })) assert.doesNotMatch(step.targetSelector, /aria-label/, step.id);
  }
  const hungarian = getCapturePhotoSteps({ hasMultipleFrames: false, method: 'system', language: 'hu' });
  assert.equal(hungarian[0].title, 'Készítsd el a fotódat');
  assert.equal(getCapturePhotoSteps({ hasMultipleFrames: false, method: 'system' })[0].title, 'Take your photo');
});
