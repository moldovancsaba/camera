import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PHOTO_MAX_PIXELS, aspectsAgree, captureOverride, chooseCaptureMethod, largestPhotoSettings } from './still-capture';

test('every touch device uses its own camera, whatever the browser; a desktop webcam takes a still where it can, else the frame', () => {
  assert.equal(chooseCaptureMethod({ touchPrimary: true, stillCapture: true }), 'system', 'Chrome on Android: the same as an iPhone');
  assert.equal(chooseCaptureMethod({ touchPrimary: true, stillCapture: false }), 'system', 'any iPhone or iPad browser');
  assert.equal(chooseCaptureMethod({ touchPrimary: false, stillCapture: true }), 'still', 'Chrome on a desktop webcam');
  assert.equal(chooseCaptureMethod({ touchPrimary: false, stillCapture: false }), 'frame', 'desktop Safari or Firefox: a file dialog would be worse than the webcam');
});

test('an override forces a method, except a still that cannot work', () => {
  assert.equal(chooseCaptureMethod({ touchPrimary: true, stillCapture: true, override: 'frame' }), 'frame');
  assert.equal(chooseCaptureMethod({ touchPrimary: false, stillCapture: true, override: 'system' }), 'system');
  assert.equal(chooseCaptureMethod({ touchPrimary: true, stillCapture: false, override: 'still' }), 'frame');
  assert.equal(chooseCaptureMethod({ touchPrimary: true, stillCapture: true, override: 'still' }), 'still');
  assert.equal(chooseCaptureMethod({ touchPrimary: false, stillCapture: false, override: 'still' }), 'frame');
  assert.equal(chooseCaptureMethod({ touchPrimary: true, stillCapture: false, override: null }), 'system');
});

test('the override comes from ?capture= and only accepts the three methods', () => {
  assert.equal(captureOverride('?capture=frame'), 'frame');
  assert.equal(captureOverride('?cameraTest=x&capture=system'), 'system');
  assert.equal(captureOverride('?capture=still'), 'still');
  assert.equal(captureOverride('?capture=best'), null);
  assert.equal(captureOverride(''), null);
});

test('the largest photo the camera offers is asked for, and nothing is invented when it does not say', () => {
  assert.deepEqual(largestPhotoSettings({ imageWidth: { max: 4896 }, imageHeight: { max: 3672 } }), { imageWidth: 4896, imageHeight: 3672 });
  assert.equal(largestPhotoSettings({ imageWidth: { max: 4896 } }), undefined);
  assert.equal(largestPhotoSettings({ imageWidth: { max: 0 }, imageHeight: { max: 3672 } }), undefined);
  assert.equal(largestPhotoSettings(null), undefined);
  assert.equal(largestPhotoSettings(undefined), undefined);
});

test('a camera with a huge still is asked for at most 40 MP, in its own shape; an 18 MP still is asked for as it is', () => {
  const huge = largestPhotoSettings({ imageWidth: { max: 16000 }, imageHeight: { max: 12000 } })!;
  assert.ok(huge.imageWidth * huge.imageHeight <= PHOTO_MAX_PIXELS);
  assert.ok(huge.imageWidth * huge.imageHeight > PHOTO_MAX_PIXELS * 0.99);
  assert.ok(Math.abs(huge.imageWidth / huge.imageHeight - 16000 / 12000) < 0.001);
  assert.deepEqual(largestPhotoSettings({ imageWidth: { max: 4896 }, imageHeight: { max: 3672 } }), { imageWidth: 4896, imageHeight: 3672 });
});

test('two shapes agree within 3%: a 4:3 photo agrees with a 4:3 stream, a 16:9 one does not', () => {
  assert.equal(aspectsAgree(4896 / 3672, 1920 / 1440), true);
  assert.equal(aspectsAgree(4000 / 3000, 1920 / 1440), true);
  assert.equal(aspectsAgree(16 / 9, 4 / 3), false);
  assert.equal(aspectsAgree(3672 / 4896, 1440 / 1920), true, 'portrait with portrait');
  assert.equal(aspectsAgree(4 / 3, 3 / 4), false, 'landscape with portrait');
  assert.equal(aspectsAgree(0, 1), false);
});
