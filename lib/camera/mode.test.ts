import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMERA_MODES, captureSettingsOf, effectiveCameraMode, parseCameraMode } from './mode';
import { chooseCaptureMethod } from './still-capture';

test('the event uses its own choice, else its partner’s, else the standard (the phone’s own camera app); an unknown stored value is no choice', () => {
  assert.equal(effectiveCameraMode(null), 'device');
  assert.equal(effectiveCameraMode({}, {}), 'device');
  assert.equal(effectiveCameraMode({}, { cameraMode: 'live' }), 'live');
  assert.equal(effectiveCameraMode({ cameraMode: 'device' }, { cameraMode: 'live' }), 'device', 'the event’s own choice wins');
  assert.equal(effectiveCameraMode({ cameraMode: 'live' }, { cameraMode: 'device' }), 'live');
  assert.equal(effectiveCameraMode({ cameraMode: null }, { cameraMode: 'live' }), 'live', 'null is no choice, so the partner’s counts');
  assert.equal(effectiveCameraMode({ cameraMode: 'sideways' }, { cameraMode: 7 }), 'device');
});

test('a request value is a mode, or empty/null for no choice; anything else is refused', () => {
  assert.deepEqual(parseCameraMode('live'), { ok: true, value: 'live' });
  assert.deepEqual(parseCameraMode('device'), { ok: true, value: 'device' });
  assert.deepEqual(parseCameraMode(''), { ok: true, value: null });
  assert.deepEqual(parseCameraMode(null), { ok: true, value: null });
  assert.deepEqual(parseCameraMode('still'), { ok: true, value: 'still' });
  assert.deepEqual(parseCameraMode('frame'), { ok: true, value: 'frame' });
  for (const bad of ['Live', 'system', 'Frame', 7, {}, true]) assert.equal(parseCameraMode(bad).ok, false, String(bad));
});

test('the four modes: what each asks of the capture page, and the way the photo is then taken on a phone and on a computer', () => {
  assert.deepEqual([...CAMERA_MODES], ['device', 'live', 'still', 'frame']);
  assert.deepEqual(captureSettingsOf('device'), { views: false, override: null });
  assert.deepEqual(captureSettingsOf(null), { views: false, override: null });
  assert.deepEqual(captureSettingsOf('live'), { views: true, override: null });
  assert.deepEqual(captureSettingsOf('still'), { views: false, override: 'still' });
  assert.deepEqual(captureSettingsOf('frame'), { views: false, override: 'frame' });
  const way = (mode: Parameters<typeof captureSettingsOf>[0], touchPrimary: boolean, stillCapture: boolean) => chooseCaptureMethod({ touchPrimary, stillCapture, ...captureSettingsOf(mode) });
  // automatic: the phone's own camera app on a phone, a real still on a computer that can, else the screen picture
  assert.equal(way('device', true, true), 'system');
  assert.equal(way('device', false, true), 'still');
  assert.equal(way('device', false, false), 'frame');
  // live (view buttons): the live view with the screen picture, on a phone too
  assert.equal(way('live', true, true), 'frame');
  assert.equal(way('live', false, true), 'frame');
  // still: the live view with a real photo from the sensor on every device that can; a browser that cannot gives the screen picture
  assert.equal(way('still', true, true), 'still');
  assert.equal(way('still', false, true), 'still');
  assert.equal(way('still', true, false), 'frame');
  // frame: the screen picture everywhere
  assert.equal(way('frame', true, true), 'frame');
  assert.equal(way('frame', false, true), 'frame');
});
