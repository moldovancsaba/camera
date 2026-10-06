import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillCropRect, toFractionRect } from './reframe';

function aspect(rect: { width: number; height: number }): number {
  return rect.width / rect.height;
}

test('a frame of the same aspect keeps the whole image', () => {
  assert.deepEqual(fillCropRect(1440, 1920, 1440 / 1920), { x: 0, y: 0, width: 1440, height: 1920 });
});

test('a taller frame trims the sides and keeps the full height (3:4 camera into 9:16)', () => {
  const rect = fillCropRect(1440, 1920, 9 / 16);
  assert.equal(rect.height, 1920);
  assert.equal(rect.width, 1080);
  assert.equal(rect.x, 180);
  assert.equal(rect.y, 0);
});

test('a wider frame trims top and bottom and keeps the full width (3:4 camera into 16:9)', () => {
  const rect = fillCropRect(1440, 1920, 16 / 9);
  assert.equal(rect.width, 1440);
  assert.equal(rect.height, 810);
  assert.equal(rect.x, 0);
  assert.equal(rect.y, 555);
});

test('a square frame on a 4:3 landscape camera keeps the full height', () => {
  assert.deepEqual(fillCropRect(1920, 1440, 1), { x: 240, y: 0, width: 1440, height: 1440 });
});

test('the crop always fits inside the source, is centred, and has the requested aspect', () => {
  const sources: Array<[number, number]> = [[1440, 1920], [1920, 1440], [1080, 1920], [1920, 1080], [320, 240], [4096, 3072], [640, 641]];
  const aspects = [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9, 0.4, 2.35];
  for (const [w, h] of sources) {
    for (const a of aspects) {
      const rect = fillCropRect(w, h, a);
      assert.ok(rect.x >= 0 && rect.y >= 0, `${w}x${h} @ ${a}`);
      assert.ok(rect.x + rect.width <= w && rect.y + rect.height <= h, `${w}x${h} @ ${a} fits`);
      assert.ok(Math.abs(aspect(rect) - a) / a < 0.01, `${w}x${h} @ ${a} aspect ${aspect(rect)}`);
      assert.ok(Math.abs(rect.x - (w - rect.width - rect.x)) <= 1, `${w}x${h} @ ${a} centred horizontally`);
      assert.ok(Math.abs(rect.y - (h - rect.height - rect.y)) <= 1, `${w}x${h} @ ${a} centred vertically`);
      assert.ok(rect.width === w || rect.height === h, `${w}x${h} @ ${a} is the largest fit`);
    }
  }
});

test('invalid input falls back to something drawable instead of throwing', () => {
  assert.deepEqual(fillCropRect(0, 0, 1), { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(fillCropRect(100, 200, 0), { x: 0, y: 0, width: 100, height: 200 });
  assert.deepEqual(fillCropRect(100, 200, Number.NaN), { x: 0, y: 0, width: 100, height: 200 });
});

test('fraction rectangles describe the same area for a preview guide', () => {
  const rect = fillCropRect(1440, 1920, 9 / 16);
  const f = toFractionRect(rect, 1440, 1920);
  assert.ok(Math.abs(f.left - 0.125) < 1e-9);
  assert.equal(f.top, 0);
  assert.ok(Math.abs(f.width - 0.75) < 1e-9);
  assert.equal(f.height, 1);
});

// ------------------------------------------------------------------ adjustable reframe (camera#209)
import {
  MAX_ZOOM,
  canShowEverything,
  clampView,
  defaultView,
  fillSize,
  fitSize,
  fitView,
  minZoom,
  modeOf,
  panView,
  toReframeRecord,
  viewBoxOf,
  zoomView,
} from './reframe';

const SW = 1440;
const SH = 1920;

test('the default view is the same crop as the fill rectangle', () => {
  for (const a of [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9]) {
    const box = viewBoxOf(defaultView(SW, SH), SW, SH, a);
    const fill = fillCropRect(SW, SH, a);
    assert.ok(Math.abs(box.width - fill.width) <= 1 && Math.abs(box.height - fill.height) <= 1, `size @ ${a}`);
    assert.ok(Math.abs(box.x - fill.x) <= 1 && Math.abs(box.y - fill.y) <= 1, `position @ ${a}`);
  }
});

test('fit contains the whole image, fill is inside it, and both have the frame aspect', () => {
  for (const a of [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9]) {
    const fill = fillSize(SW, SH, a);
    const fit = fitSize(SW, SH, a);
    assert.ok(Math.abs(fill.width / fill.height - a) < 1e-9);
    assert.ok(Math.abs(fit.width / fit.height - a) < 1e-9);
    assert.ok(fill.width <= SW + 1e-9 && fill.height <= SH + 1e-9, 'fill inside the image');
    assert.ok(fit.width >= SW - 1e-9 && fit.height >= SH - 1e-9, 'fit contains the image');
  }
});

test('the minimum zoom shows the whole image, and is 1 when the frame has the image shape', () => {
  assert.equal(minZoom(SW, SH, SW / SH), 1);
  const low = minZoom(SW, SH, 16 / 9);
  assert.ok(low < 1);
  const box = viewBoxOf(fitView(SW, SH, 16 / 9), SW, SH, 16 / 9);
  assert.ok(box.x <= 1e-6 && box.y <= 1e-6 && box.x + box.width >= SW - 1e-6 && box.y + box.height >= SH - 1e-6);
});

test('the zoom is clamped between fit and the maximum', () => {
  const a = 9 / 16;
  assert.equal(clampView({ zoom: 99, centerX: 0, centerY: 0 }, SW, SH, a).zoom, MAX_ZOOM);
  assert.equal(clampView({ zoom: 0.01, centerX: 0, centerY: 0 }, SW, SH, a).zoom, minZoom(SW, SH, a));
  assert.equal(clampView({ zoom: Number.NaN, centerX: 0, centerY: 0 }, SW, SH, a).zoom, 1);
});

test('panning is limited so the view box stays over the image', () => {
  const a = 9 / 16;
  const zoomed = zoomView(defaultView(SW, SH), 2, null, SW, SH, a);
  const far = panView(zoomed, 1e6, -1e6, SW, SH, a);
  const box = viewBoxOf(far, SW, SH, a);
  assert.ok(Math.abs(box.x + box.width - SW) < 1e-6, 'stops at the right edge');
  assert.ok(Math.abs(box.y) < 1e-6, 'stops at the top edge');
});

test('when the view box is larger than the image on an axis, the image stays centred on it', () => {
  const a = 16 / 9;
  const fit = fitView(SW, SH, a);
  const moved = panView(fit, 500, 500, SW, SH, a);
  assert.deepEqual(moved, fit);
});

test('zooming keeps the anchor point at the same place inside the frame', () => {
  const a = 9 / 16;
  const start = panView(defaultView(SW, SH), 90, 300, SW, SH, a);
  const before = viewBoxOf(start, SW, SH, a);
  const anchor = { x: before.x + before.width * 0.25, y: before.y + before.height * 0.7 };
  const zoomed = zoomView(start, 2.5, anchor, SW, SH, a);
  const after = viewBoxOf(zoomed, SW, SH, a);
  assert.ok(Math.abs((anchor.x - after.x) / after.width - 0.25) < 1e-6, 'x position inside the frame');
  assert.ok(Math.abs((anchor.y - after.y) / after.height - 0.7) < 1e-6, 'y position inside the frame');
});

test('zooming in then out around the same point returns to the starting view', () => {
  const a = 3 / 4;
  const start = defaultView(SW, SH);
  const box = viewBoxOf(start, SW, SH, a);
  const anchor = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const back = zoomView(zoomView(start, 2, anchor, SW, SH, a), 1, anchor, SW, SH, a);
  assert.ok(Math.abs(back.centerX - start.centerX) < 1e-6 && Math.abs(back.centerY - start.centerY) < 1e-6);
  assert.equal(back.zoom, 1);
});

test('every crop is reachable: any point of the image can be brought to the frame centre when zoomed in', () => {
  const a = 9 / 16;
  const zoomed = zoomView(defaultView(SW, SH), 3, null, SW, SH, a);
  const box = viewBoxOf(zoomed, SW, SH, a);
  for (const [tx, ty] of [[box.width / 2, box.height / 2], [SW - box.width / 2, SH - box.height / 2], [SW / 2, SH / 2]]) {
    const moved = panView(zoomed, tx - zoomed.centerX, ty - zoomed.centerY, SW, SH, a);
    const b = viewBoxOf(moved, SW, SH, a);
    assert.ok(b.x >= -1e-6 && b.y >= -1e-6 && b.x + b.width <= SW + 1e-6 && b.y + b.height <= SH + 1e-6);
  }
});

test('the mode is fill, fit or custom', () => {
  const a = 16 / 9;
  assert.equal(modeOf(defaultView(SW, SH), SW, SH, a), 'fill');
  assert.equal(modeOf(fitView(SW, SH, a), SW, SH, a), 'fit');
  assert.equal(modeOf(zoomView(defaultView(SW, SH), 1.5, null, SW, SH, a), SW, SH, a), 'custom');
  assert.equal(modeOf(panView(zoomView(defaultView(SW, SH), 2, null, SW, SH, a), 50, 0, SW, SH, a), SW, SH, a), 'custom');
  // A frame with the image's own shape has no distinct "fit": it is "fill".
  assert.equal(modeOf(fitView(SW, SH, SW / SH), SW, SH, SW / SH), 'fill');
});

test('the stored record describes the crop in source pixels and can reproduce it', () => {
  const a = 9 / 16;
  const view = panView(zoomView(defaultView(SW, SH), 2, null, SW, SH, a), 40, -20, SW, SH, a);
  const record = toReframeRecord(view, SW, SH, a, true);
  assert.equal(record.version, 1);
  assert.equal(record.mode, 'custom');
  assert.equal(record.sourceWidth, SW);
  assert.equal(record.frameAspect, 0.5625);
  assert.equal(record.mirrored, true);
  assert.ok(Math.abs(record.crop.width / record.crop.height - a) < 0.01);
  const box = viewBoxOf(view, SW, SH, a);
  assert.ok(Math.abs(record.crop.x - box.x) < 0.06 && Math.abs(record.crop.width - box.width) < 0.06);
  // A fit record's crop extends past the image on the axis where the frame is wider (here the sides).
  const fit = toReframeRecord(fitView(SW, SH, 16 / 9), SW, SH, 16 / 9, false);
  assert.equal(fit.mode, 'fit');
  assert.ok(fit.crop.x < 0 && fit.crop.x + fit.crop.width > SW);
  assert.ok(Math.abs(fit.crop.y) < 0.2 && Math.abs(fit.crop.y + fit.crop.height - SH) < 0.2, 'exactly the image height');
});

test('show everything is only offered when it differs from fill, with a half percent tolerance', () => {
  assert.equal(canShowEverything(SW, SH, 9 / 16), true);
  assert.equal(canShowEverything(SW, SH, 16 / 9), true);
  assert.equal(canShowEverything(SW, SH, SW / SH), false, 'the image own shape');
  assert.equal(canShowEverything(320, 240, 1.3333), false, 'a rounded 4:3 is the same shape');
  assert.equal(canShowEverything(320, 240, 1.4), true, 'a clearly different shape');
});
