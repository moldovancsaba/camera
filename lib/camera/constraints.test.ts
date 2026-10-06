import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANVAS_MAX_LONG_SIDE,
  CANVAS_MAX_PIXELS,
  ORIGINAL_MAX_LONG_SIDE,
  ORIGINAL_MAX_PIXELS,
  buildVideoConstraintChain,
  capCanvasSize,
  isTerminalCameraError,
  isTouchPrimaryDevice,
} from './constraints';

test('a phone held upright asks for a portrait 4:3 mode, never 4K and never an aspect ratio', () => {
  const [preferred] = buildVideoConstraintChain({ facing: 'user', portrait: true, touchPrimary: true });
  assert.equal(preferred.label, 'preferred');
  assert.deepEqual(preferred.constraints, {
    facingMode: { ideal: 'user' },
    width: { ideal: 1440 },
    height: { ideal: 1920 },
  });
  assert.equal(preferred.width, 1440);
  assert.equal(preferred.height, 1920);
  assert.equal('aspectRatio' in (preferred.constraints as object), false);
});

test('a phone held sideways asks for a landscape 4:3 mode', () => {
  const [preferred] = buildVideoConstraintChain({ facing: 'environment', portrait: false, touchPrimary: true });
  assert.deepEqual(preferred.constraints, {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1440 },
  });
});

test('a desktop webcam always asks for landscape, even in a tall window', () => {
  const [preferred] = buildVideoConstraintChain({ facing: 'user', portrait: true, touchPrimary: false });
  assert.deepEqual((preferred.constraints as MediaTrackConstraints).width, { ideal: 1920 });
  assert.deepEqual((preferred.constraints as MediaTrackConstraints).height, { ideal: 1440 });
});

test('the chain falls back from the preferred mode to the facing only, then to anything', () => {
  const chain = buildVideoConstraintChain({ facing: 'user', portrait: true, touchPrimary: true });
  assert.deepEqual(chain.map((s) => s.label), ['preferred', 'relaxed', 'relaxed']);
  assert.deepEqual(chain[1].constraints, { facingMode: { ideal: 'user' } });
  assert.equal(chain[2].constraints, true);
});

test('facing mode is only ever an ideal, so it cannot make a device without it fail', () => {
  for (const step of buildVideoConstraintChain({ facing: 'user', portrait: false, touchPrimary: false })) {
    if (typeof step.constraints === 'object') {
      const facing = (step.constraints as MediaTrackConstraints).facingMode as { ideal?: string; exact?: string };
      assert.equal(facing.exact, undefined);
      assert.equal(facing.ideal, 'user');
    }
  }
});

test('permission and missing-camera errors are terminal, other errors are retried with looser constraints', () => {
  for (const name of ['NotAllowedError', 'PermissionDeniedError', 'SecurityError', 'NotFoundError', 'DevicesNotFoundError']) {
    assert.equal(isTerminalCameraError({ name }), true, name);
  }
  for (const name of ['OverconstrainedError', 'NotReadableError', 'AbortError', 'TypeError']) {
    assert.equal(isTerminalCameraError({ name }), false, name);
  }
  assert.equal(isTerminalCameraError(null), false);
  assert.equal(isTerminalCameraError(new Error('x')), false);
});

test('touch-primary detection uses the pointer type or the UA client hint, not the user agent string', () => {
  assert.equal(isTouchPrimaryDevice({ coarsePointer: true }), true);
  assert.equal(isTouchPrimaryDevice({ coarsePointer: false, uaMobile: true }), true);
  assert.equal(isTouchPrimaryDevice({ coarsePointer: false }), false);
  assert.equal(isTouchPrimaryDevice({ coarsePointer: false, uaMobile: false }), false);
});

test('capCanvasSize leaves small sizes alone and never scales up', () => {
  assert.deepEqual(capCanvasSize(1080, 1920), { width: 1080, height: 1920 });
  assert.deepEqual(capCanvasSize(640, 480), { width: 640, height: 480 });
});

test('capCanvasSize caps the long side and keeps the aspect ratio', () => {
  const capped = capCanvasSize(3000, 4000);
  assert.equal(capped.height, CANVAS_MAX_LONG_SIDE);
  assert.equal(capped.width, 1536);
  assert.ok(Math.abs(capped.width / capped.height - 0.75) < 0.001);
});

test('capCanvasSize caps total pixels below the iOS limit', () => {
  const capped = capCanvasSize(4000, 4000, { maxLongSide: 10000 });
  assert.ok(capped.width * capped.height <= CANVAS_MAX_PIXELS);
  assert.ok(capped.width * capped.height > CANVAS_MAX_PIXELS * 0.99);
  assert.ok(capped.width * capped.height < 16_777_216, 'below the 16,777,216 pixel iOS Safari limit');
});

test('capCanvasSize survives zero and invalid input', () => {
  assert.deepEqual(capCanvasSize(0, 0), { width: 1, height: 1 });
  assert.deepEqual(capCanvasSize(Number.NaN, 100), { width: 1, height: 100 });
});

test('the full-frame original keeps typical phone frames whole and stays under the iOS canvas limit', () => {
  const limits = { maxLongSide: ORIGINAL_MAX_LONG_SIDE, maxPixels: ORIGINAL_MAX_PIXELS };
  assert.deepEqual(capCanvasSize(1440, 1920, limits), { width: 1440, height: 1920 }, 'the 4:3 mode we request is stored 1:1');
  assert.deepEqual(capCanvasSize(1920, 1080, limits), { width: 1920, height: 1080 });
  const big = capCanvasSize(4032, 3024, limits);
  assert.ok(big.width * big.height <= ORIGINAL_MAX_PIXELS);
  assert.ok(Math.max(big.width, big.height) <= ORIGINAL_MAX_LONG_SIDE);
  assert.ok(ORIGINAL_MAX_PIXELS < 16_777_216, 'below the 16,777,216 pixel iOS Safari limit');
});
