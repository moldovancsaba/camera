import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCapturePhotoSteps } from './captureTourSteps';

test('on a touch device the photo tour points at the Take photo button, not at a live shutter that is not there', () => {
  const steps = getCapturePhotoSteps({ method: 'system' });
  assert.deepEqual(steps.map((s) => s.id), ['capture-take-photo']);
  assert.equal(steps[0].targetSelector, '[data-tour-id="capture-take-photo"]');
});

test('the photo tour only points at the capture control, even when multiple frames are available', () => {
  for (const method of [undefined, null, 'still', 'frame'] as const) {
    assert.deepEqual(getCapturePhotoSteps({ method }).map((s) => s.id), ['capture-shutter']);
  }
  assert.deepEqual(getCapturePhotoSteps({ method: 'frame' }).map((s) => s.id), ['capture-shutter']);
  assert.deepEqual(getCapturePhotoSteps({ method: 'system' }).map((s) => s.id), ['capture-take-photo']);
});

test('the tour points at data attributes, not at texts, so translating a label cannot lose a step; its words follow the language', () => {
  for (const method of ['system', 'frame'] as const) {
    for (const step of getCapturePhotoSteps({ method })) assert.doesNotMatch(step.targetSelector, /aria-label/, step.id);
  }
  const hungarian = getCapturePhotoSteps({ method: 'system', language: 'hu' });
  assert.equal(hungarian[0].title, 'Készítsd el a fotódat');
  assert.equal(getCapturePhotoSteps({ method: 'system' })[0].title, 'Take your photo');
});
