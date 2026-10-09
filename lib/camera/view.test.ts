import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVideoConstraintChain, streamShapeMismatch } from './constraints';
import { DEFAULT_VIEW, LANDSCAPE_ASPECT, PORTRAIT_ASPECT, TIGHT_KEEP, currentShape, viewAspect, viewRect, viewsOverride, wantedWindow, withField, withShape } from './view';

test('the controls are off unless the address says so', () => {
  for (const on of ['?views=1', '?capture=frame&views=on', '?views=true']) assert.equal(viewsOverride(on), true, on);
  for (const off of ['', '?views=0', '?views=', '?capture=frame', 'garbage%']) assert.equal(viewsOverride(off), false, off);
});

test('auto follows the window, a chosen shape does not: landscape stays landscape while the phone is held upright', () => {
  assert.deepEqual(wantedWindow('auto', 390, 844), { width: 390, height: 844 });
  assert.deepEqual(wantedWindow('landscape', 390, 844), { width: 16, height: 9 });
  assert.deepEqual(wantedWindow('portrait', 844, 390), { width: 9, height: 16 });
});

test('a landscape view asks the camera for a landscape stream on an upright phone, a portrait view for a portrait one', () => {
  const asked = (shape: 'auto' | 'portrait' | 'landscape') => {
    const w = wantedWindow(shape, 390, 844);
    return buildVideoConstraintChain({ facing: 'user', portrait: w.height >= w.width, touchPrimary: true })[0];
  };
  assert.ok((asked('landscape').width ?? 0) > (asked('landscape').height ?? 0), 'landscape: wider than tall');
  assert.ok((asked('portrait').width ?? 0) < (asked('portrait').height ?? 0), 'portrait: taller than wide');
  assert.ok((asked('auto').width ?? 0) < (asked('auto').height ?? 0), 'auto on an upright phone: portrait, as before');
});

test('a landscape stream in an upright phone is what was chosen, not a mismatch to be turned back; auto still turns a wrong-way stream back', () => {
  const upright = { touchPrimary: true, windowWidth: 390, windowHeight: 844, videoWidth: 1920, videoHeight: 1440 };
  const w = wantedWindow('landscape', upright.windowWidth, upright.windowHeight);
  assert.equal(streamShapeMismatch({ ...upright, windowWidth: w.width, windowHeight: w.height }), null, 'landscape wanted, landscape delivered');
  assert.equal(streamShapeMismatch(upright), 'portrait', 'in auto the same stream is the wrong way round and is asked again');
  const p = wantedWindow('portrait', 844, 390);
  assert.equal(streamShapeMismatch({ touchPrimary: true, windowWidth: p.width, windowHeight: p.height, videoWidth: 1920, videoHeight: 1440 }), 'portrait', 'portrait chosen, landscape delivered: ask again');
});

test('the tight view keeps the middle of the picture, the wide view all of it', () => {
  assert.equal(viewRect(1440, 1920, { shape: 'auto', field: 'wide' }), null);
  const crop = viewRect(1440, 1920, { shape: 'auto', field: 'tight' });
  assert.ok(crop);
  assert.equal(crop.width, TIGHT_KEEP);
  assert.equal(crop.height, TIGHT_KEEP);
  assert.ok(Math.abs(crop.x * 2 + crop.width - 1) < 1e-9, 'centred across');
  assert.ok(Math.abs(crop.y * 2 + crop.height - 1) < 1e-9, 'centred down');
});

test('a phone that ignores the shape asked for (the owner\'s iPhone gave landscape for both) still gets the shape chosen: the middle is cut to it, so a press always changes the picture', () => {
  const landscapeStream = { w: 1920, h: 1440 };
  const portrait = viewRect(landscapeStream.w, landscapeStream.h, { shape: 'portrait', field: 'wide' });
  assert.ok(portrait);
  assert.equal(portrait.height, 1, 'all of the height');
  assert.ok(Math.abs(portrait.width - 0.5625) < 1e-9, 'a 3:4 slice of 4:3: 9/16 of the width');
  assert.ok(Math.abs(viewAspect(landscapeStream.w, landscapeStream.h, { shape: 'portrait', field: 'wide' }) - PORTRAIT_ASPECT) < 1e-9);
  assert.equal(viewRect(landscapeStream.w, landscapeStream.h, { shape: 'landscape', field: 'wide' }), null, 'already landscape: nothing is cut');
  const portraitStream = { w: 1440, h: 1920 };
  const landscape = viewRect(portraitStream.w, portraitStream.h, { shape: 'landscape', field: 'wide' });
  assert.ok(landscape);
  assert.equal(landscape.width, 1);
  assert.ok(Math.abs(viewAspect(portraitStream.w, portraitStream.h, { shape: 'landscape', field: 'wide' }) - LANDSCAPE_ASPECT) < 1e-9);
  assert.equal(viewRect(portraitStream.w, portraitStream.h, { shape: 'portrait', field: 'wide' }), null);
});

test('shape and tight add up, always centred, and the shape of the result is the shape chosen', () => {
  const view = { shape: 'portrait', field: 'tight' } as const;
  const rect = viewRect(1920, 1440, view)!;
  assert.ok(Math.abs(rect.width - 0.5625 * TIGHT_KEEP) < 1e-9);
  assert.ok(Math.abs(rect.height - TIGHT_KEEP) < 1e-9);
  assert.ok(Math.abs(rect.x * 2 + rect.width - 1) < 1e-9 && Math.abs(rect.y * 2 + rect.height - 1) < 1e-9);
  assert.ok(Math.abs(viewAspect(1920, 1440, view) - PORTRAIT_ASPECT) < 1e-9);
  assert.equal(viewAspect(0, 0, view), 0, 'no picture yet');
  assert.equal(viewAspect(1920, 1440, DEFAULT_VIEW), 1920 / 1440, 'auto and wide: the picture as it is');
  assert.equal(viewRect(1440, 1920, { shape: 'portrait', field: 'wide' }), null, 'within 3 % of the shape: left alone');
});

test('a press changes one choice and keeps the other; pressing the choice that is on changes nothing', () => {
  const landscape = withShape(DEFAULT_VIEW, 'landscape');
  assert.deepEqual(landscape, { shape: 'landscape', field: 'wide' });
  assert.deepEqual(withField(landscape, 'tight'), { shape: 'landscape', field: 'tight' });
  assert.equal(withShape(landscape, 'landscape'), landscape);
  assert.equal(withField(DEFAULT_VIEW, 'wide'), DEFAULT_VIEW);
  assert.equal(currentShape(1440, 1920), 'portrait');
  assert.equal(currentShape(1920, 1440), 'landscape');
});
