import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIAGNOSTIC_VERSION, sanitizeDiagnostic } from './diagnostics';

const SESSION = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';

test('a complete stream_started record passes through unchanged', () => {
  const input = {
    v: DIAGNOSTIC_VERSION,
    kind: 'stream_started',
    session: SESSION,
    testRun: 'iphone-15-safari',
    facingMode: 'user',
    requested: { mode: 'preferred', width: 1080, height: 1920, aspectRatio: 0.563 },
    granted: { width: 1080, height: 1920, frameRate: 30, aspectRatio: 0.563, facingMode: 'user', resizeMode: 'none' },
    deviceCount: 2,
    timing: { startMs: 420, firstFrameMs: 180, shutterUnlockMs: 790 },
    page: { orientation: 'portrait', viewportWidth: 390, viewportHeight: 844, devicePixelRatio: 3 },
  };
  assert.deepEqual(sanitizeDiagnostic(input), input);
});

test('a capture record keeps its outcome and statistics', () => {
  const record = sanitizeDiagnostic({
    v: 1,
    kind: 'capture',
    session: SESSION,
    timing: { shutterDelayMs: 2400 },
    capture: { outcome: 'ok', attempts: 2, brokenRetries: 1, notReadyRetries: 0, lumaMean: 112.46, lumaStdDev: 41.04, videoWidth: 1080, videoHeight: 1920 },
  });
  assert.ok(record);
  assert.equal(record.capture?.outcome, 'ok');
  assert.equal(record.capture?.lumaMean, 112.5);
  assert.equal(record.capture?.brokenRetries, 1);
});

test('anything that could identify a person or a device is dropped, never passed through', () => {
  const record = sanitizeDiagnostic({
    v: 1,
    kind: 'stream_started',
    session: SESSION,
    deviceId: 'abcdef0123456789',
    label: 'FaceTime HD Camera',
    email: 'person@example.com',
    ip: '203.0.113.7',
    image: 'data:image/jpeg;base64,AAAA',
    granted: { width: 1920, height: 1080, deviceId: 'abcdef', label: 'Back Camera', groupId: 'g1' },
    page: { orientation: 'portrait', url: 'https://example.test/capture/abc?email=x' },
  });
  assert.ok(record);
  const serialized = JSON.stringify(record);
  for (const forbidden of ['deviceId', 'label', 'email', 'ip', 'image', 'groupId', 'url', 'FaceTime', 'person@', '203.0.113']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must not survive`);
  }
  assert.deepEqual(record.granted, { width: 1920, height: 1080 });
});

test('numbers are clamped to sane ranges and non-numbers are dropped', () => {
  const record = sanitizeDiagnostic({
    v: 1,
    kind: 'stream_started',
    session: SESSION,
    deviceCount: 9999,
    timing: { startMs: -50, firstFrameMs: Number.NaN, shutterUnlockMs: '700', shutterDelayMs: 99999999 },
    granted: { width: 1e9, frameRate: 29.97 },
  });
  assert.ok(record);
  assert.equal(record.deviceCount, 32);
  assert.deepEqual(record.timing, { startMs: 0, shutterDelayMs: 3600000 });
  assert.deepEqual(record.granted, { width: 16384, frameRate: 30 });
});

test('unsupported versions, kinds and sessions are rejected', () => {
  assert.equal(sanitizeDiagnostic(null), null);
  assert.equal(sanitizeDiagnostic('text'), null);
  assert.equal(sanitizeDiagnostic([]), null);
  assert.equal(sanitizeDiagnostic({ v: 2, kind: 'capture', session: SESSION, capture: { outcome: 'ok' } }), null);
  assert.equal(sanitizeDiagnostic({ v: 1, kind: 'other', session: SESSION }), null);
  assert.equal(sanitizeDiagnostic({ v: 1, kind: 'stream_started', session: 'short' }), null);
  assert.equal(sanitizeDiagnostic({ v: 1, kind: 'stream_started', session: 'UPPER/../..script<>' }), null);
});

test('a capture record without a valid outcome is rejected', () => {
  assert.equal(sanitizeDiagnostic({ v: 1, kind: 'capture', session: SESSION }), null);
  assert.equal(sanitizeDiagnostic({ v: 1, kind: 'capture', session: SESSION, capture: { outcome: 'great' } }), null);
});

test('testRun is lower-cased and only kept when it is a short safe label', () => {
  const ok = sanitizeDiagnostic({ v: 1, kind: 'stream_started', session: SESSION, testRun: '  Pixel-8_Chrome ' });
  assert.equal(ok?.testRun, 'pixel-8_chrome');
  const bad = sanitizeDiagnostic({ v: 1, kind: 'stream_started', session: SESSION, testRun: 'a b<script>' });
  assert.ok(bad);
  assert.equal('testRun' in bad, false);
  const long = sanitizeDiagnostic({ v: 1, kind: 'stream_started', session: SESSION, testRun: 'x'.repeat(33) });
  assert.ok(long);
  assert.equal('testRun' in long, false);
});

test('enum fields outside the allowlist are dropped', () => {
  const record = sanitizeDiagnostic({
    v: 1,
    kind: 'stream_started',
    session: SESSION,
    facingMode: 'rear',
    requested: { mode: 'ultra' },
    granted: { facingMode: 'sideways', resizeMode: 'stretch' },
  });
  assert.ok(record);
  assert.equal('facingMode' in record, false);
  assert.equal('requested' in record, false);
  assert.equal('granted' in record, false);
});

test('a capture record names how the image was taken and the photo size, and drops anything else', () => {
  const record = sanitizeDiagnostic({
    v: 1,
    kind: 'capture',
    session: SESSION,
    capture: { outcome: 'ok', method: 'system', nativeWidth: 4896, nativeHeight: 3672, outputWidth: 4896, outputHeight: 3672, stillFellBack: true, label: 'iPhone Air' },
  });
  assert.deepEqual(record?.capture, { outcome: 'ok', method: 'system', nativeWidth: 4896, nativeHeight: 3672, outputWidth: 4896, outputHeight: 3672, stillFellBack: true });

  const odd = sanitizeDiagnostic({ v: 1, kind: 'capture', session: SESSION, capture: { outcome: 'ok', method: 'magic', nativeWidth: 'big', stillFellBack: 'yes' } });
  assert.deepEqual(odd?.capture, { outcome: 'ok' });
});
