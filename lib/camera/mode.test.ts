import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveCameraMode, parseCameraMode } from './mode';

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
  for (const bad of ['Live', 'frame', 7, {}, true]) assert.equal(parseCameraMode(bad).ok, false, String(bad));
});
