import assert from 'node:assert/strict';
import crypto from 'crypto';
import { test } from 'node:test';
import { checkSharedSecret, logSharedSecretRejection, safeEqual } from './safeEqual';

const SECRET = 's3cr3t-value-0123456789abcdef';

test('safeEqual: identical non-empty strings match', () => {
  assert.equal(safeEqual(SECRET, SECRET), true);
  assert.equal(safeEqual('ünïcødé-🔑', 'ünïcødé-🔑'), true);
});

test('safeEqual: same-length strings that differ in one character do not match', () => {
  const lastCharFlipped = SECRET.slice(0, -1) + (SECRET.endsWith('f') ? 'e' : 'f');
  const firstCharFlipped = (SECRET.startsWith('s') ? 'S' : 's') + SECRET.slice(1);
  assert.equal(lastCharFlipped.length, SECRET.length);
  assert.equal(safeEqual(lastCharFlipped, SECRET), false);
  assert.equal(safeEqual(firstCharFlipped, SECRET), false);
});

test('safeEqual: different lengths (prefix, suffix, longer) return false instead of throwing', () => {
  assert.equal(safeEqual(SECRET.slice(0, 5), SECRET), false);
  assert.equal(safeEqual(SECRET + 'x', SECRET), false);
  assert.equal(safeEqual('x', SECRET), false);
});

test('safeEqual: fails closed on empty, null and undefined, even when both sides are empty', () => {
  assert.equal(safeEqual('', ''), false);
  assert.equal(safeEqual(undefined, undefined), false);
  assert.equal(safeEqual(null, null), false);
  assert.equal(safeEqual('', SECRET), false);
  assert.equal(safeEqual(SECRET, ''), false);
  assert.equal(safeEqual(SECRET, undefined), false);
  assert.equal(safeEqual(undefined, SECRET), false);
});

test('safeEqual: compares equal-length SHA-256 digests with crypto.timingSafeEqual, whatever the input lengths', (t) => {
  const calls: Array<[number, number]> = [];
  const real = crypto.timingSafeEqual;
  t.mock.method(crypto, 'timingSafeEqual', (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
    calls.push([a.byteLength, b.byteLength]);
    return real(a, b);
  });

  safeEqual('short', SECRET);
  safeEqual(SECRET, SECRET);
  safeEqual('a much longer presented value than the configured one', SECRET);

  assert.deepEqual(calls, [
    [32, 32],
    [32, 32],
    [32, 32],
  ]);
});

test('checkSharedSecret: classifies not_configured, missing, mismatch and ok', () => {
  assert.equal(checkSharedSecret(undefined, SECRET), 'not_configured');
  assert.equal(checkSharedSecret('', SECRET), 'not_configured');
  assert.equal(checkSharedSecret(undefined, ''), 'not_configured');
  assert.equal(checkSharedSecret(SECRET, ''), 'missing');
  assert.equal(checkSharedSecret(SECRET, undefined), 'missing');
  assert.equal(checkSharedSecret(SECRET, 'wrong'), 'mismatch');
  assert.equal(checkSharedSecret(SECRET, SECRET), 'ok');
});

test('logSharedSecretRejection: error for an unset env var, warn for a mismatch, silent for a missing credential', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const warns = t.mock.method(console, 'warn', () => {});

  logSharedSecretRejection('messmass internal API', 'CAMERA_MESSMASS_INTERNAL_SECRET', 'not_configured');
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0].arguments[0]), /CAMERA_MESSMASS_INTERNAL_SECRET is not configured/);

  logSharedSecretRejection('messmass internal API', 'CAMERA_MESSMASS_INTERNAL_SECRET', 'mismatch');
  assert.equal(warns.mock.callCount(), 1);
  assert.match(String(warns.mock.calls[0].arguments[0]), /does not match CAMERA_MESSMASS_INTERNAL_SECRET/);

  logSharedSecretRejection('messmass internal API', 'CAMERA_MESSMASS_INTERNAL_SECRET', 'missing');
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(warns.mock.callCount(), 1);
});
