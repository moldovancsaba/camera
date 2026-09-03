import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPlainObject } from './route';
import { DEFAULT_CARD_DISPLAY_SETTINGS } from '@/lib/admin/card-display-settings';

test('isPlainObject: {} is true', () => {
  assert.equal(isPlainObject({}), true);
});

test('isPlainObject: null is false', () => {
  assert.equal(isPlainObject(null), false);
});

test('isPlainObject: [] is false', () => {
  assert.equal(isPlainObject([]), false);
});

test('isPlainObject: "x" is false', () => {
  assert.equal(isPlainObject('x'), false);
});

test('isPlainObject: 123 is false', () => {
  assert.equal(isPlainObject(123), false);
});

test('isPlainObject: undefined is false', () => {
  assert.equal(isPlainObject(undefined), false);
});

/** Mirrors the exact shape-check loop in the PATCH handler (route.ts), against the real isPlainObject export. */
function assertValidPatchBody(rawBody: Record<string, unknown>): void {
  for (const key of ['metadata', 'status', 'actions'] as const) {
    if (key in rawBody && !isPlainObject(rawBody[key])) {
      throw new Error(`'${key}' must be an object`);
    }
  }
}

test('PATCH body with metadata as a string is rejected', () => {
  assert.throws(() => assertValidPatchBody({ metadata: 'x' }), /'metadata' must be an object/);
});

test('PATCH body with actions as an array is rejected', () => {
  assert.throws(() => assertValidPatchBody({ actions: [1, 2, 3] }), /'actions' must be an object/);
});

test('PATCH body with metadata as null is rejected (typeof null === "object" trap)', () => {
  assert.throws(() => assertValidPatchBody({ metadata: null }), /'metadata' must be an object/);
});

test('PATCH body with a well-formed metadata partial is accepted and merges without stray keys', () => {
  assert.doesNotThrow(() => assertValidPatchBody({ metadata: { email: false } }));
  const merged = { ...DEFAULT_CARD_DISPLAY_SETTINGS.metadata, ...{ email: false } };
  assert.equal(merged.email, false);
  assert.equal(merged.eventPartner, true);
  assert.deepEqual(Object.keys(merged).sort(), ['email', 'eventPartner', 'garmentName']);
});

test('PATCH body with an empty object partial is accepted as a no-op', () => {
  assert.doesNotThrow(() => assertValidPatchBody({ metadata: {} }));
});

test('PATCH body with a field entirely absent is untouched (no regression)', () => {
  assert.doesNotThrow(() => assertValidPatchBody({}));
  const merged = { ...DEFAULT_CARD_DISPLAY_SETTINGS.metadata, ...(undefined as Record<string, unknown> | undefined) };
  assert.deepEqual(merged, DEFAULT_CARD_DISPLAY_SETTINGS.metadata);
});
