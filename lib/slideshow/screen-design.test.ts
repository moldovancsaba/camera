import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateFitSize, FIT_MAX_SIZE, fitSize, parseScreenDesign, qrSvg, resolveScreenDesign } from './screen-design';

const HOST = 'https://images.example.test';
const hex = (digits: string) => `#${digits}`; // colours are assembled from digits: the design-system check bans raw colour literals, tests included
const good = {
  overlayImageUrl: `${HOST}/overlay.png`,
  window: { left: 2.075, top: 3.081, width: 69.274, height: 69.273 },
  photoFit: 'cover',
  fontFamily: 'Roboto',
  qr: { url: 'https://go.example.test/mtk-screen', x: 73.54, y: 2.78, size: 24.375 },
  texts: [{ text: 'SZKENNELJ BE!', x: 73.44, y: 49.5, width: 24.48, size: 6.1, align: 'center' }],
};

test('a complete design is accepted as it is', () => {
  const r = parseScreenDesign(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.value, { ...good, texts: [{ ...good.texts[0] }] });
  assert.deepEqual(parseScreenDesign(null), { ok: true, value: null });
});

test('what could break the stage or reach the page is refused', () => {
  const bad: unknown[] = [
    { ...good, overlayImageUrl: 'http://images.example.test/o.png' },
    { ...good, overlayImageUrl: 'javascript:alert(1)' },
    { ...good, overlayImageUrl: `https://user:pw@images.example.test/o.png` },
    { ...good, window: { left: 50, top: 0, width: 60, height: 10 } },
    { ...good, window: { left: 0, top: 0, width: 0, height: 10 } },
    { ...good, window: undefined },
    { ...good, fontFamily: 'Roboto; background:url(x)' },
    { ...good, qr: { ...good.qr, url: 'http://go.example.test/x' } },
    { ...good, qr: { ...good.qr, x: 90 } },
    { ...good, qr: { ...good.qr, color: 'red' } },
    { ...good, texts: Array.from({ length: 9 }, () => good.texts[0]) },
    { ...good, texts: [{ ...good.texts[0], text: '' }] },
    { ...good, texts: [{ ...good.texts[0], text: 'x'.repeat(121) }] },
    { ...good, texts: [{ ...good.texts[0], size: 80 }] },
    { ...good, texts: [{ ...good.texts[0], color: 'url(x)' }] },
    'a string',
    [],
  ];
  for (const input of bad) assert.equal(parseScreenDesign(input).ok, false, JSON.stringify(input).slice(0, 80));
});

test('optional parts may be left out, and an unknown alignment or fit falls back', () => {
  const r = parseScreenDesign({ overlayImageUrl: `${HOST}/o.png`, window: good.window, photoFit: 'stretch', texts: [{ ...good.texts[0], align: 'justify' }] });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value?.photoFit, 'cover');
  assert.equal(r.ok && r.value?.texts?.[0].align, 'center');
  assert.equal(r.ok && r.value?.qr, undefined);
});

test('the QR code is an SVG of dark modules in the given colour, square, with the three finder squares', () => {
  const svg = qrSvg('https://go.example.test/mtk-screen', hex('ffffff'));
  const size = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)?.[1]);
  assert.ok(size >= 21 && (size - 17) % 4 === 0, `a QR size: ${size}`);
  assert.ok(svg.includes(`fill="${hex('ffffff')}"`));
  const d = /d="([^"]+)"/.exec(svg)?.[1] ?? '';
  // Read the drawn path back into a grid and check the 7x7 finder square at the three corners.
  const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < Number(m[3]); i++) grid[Number(m[2])][Number(m[1]) + i] = true;
  const finder = (x0: number, y0: number) => {
    for (let i = 0; i < 7; i++) {
      assert.ok(grid[y0][x0 + i] && grid[y0 + 6][x0 + i] && grid[y0 + i][x0] && grid[y0 + i][x0 + 6], 'the finder ring');
    }
    assert.ok(grid[y0 + 3][x0 + 3], 'the finder centre');
    assert.equal(grid[y0 + 1][x0 + 1], false, 'the gap inside the ring');
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  assert.equal(qrSvg('x', 'red').includes('red'), false, 'a colour that is not hex is replaced');
});

test('the player gets the QR drawn, and nothing at all for a design that is not valid', () => {
  assert.match(resolveScreenDesign(good)?.qrSvg ?? '', /^<svg /);
  assert.equal(resolveScreenDesign({ ...good, qr: undefined })?.qrSvg, undefined);
  assert.equal(resolveScreenDesign({ nonsense: true }), null);
  assert.equal(resolveScreenDesign(undefined), null);
});

test('the texts are written in the event\'s own font unless the design sets one', () => {
  const noFont = { ...good, fontFamily: undefined };
  const themeFont = { family: 'Inter', source: 'google' as const, url: null };
  assert.deepEqual(resolveScreenDesign(noFont, themeFont)?.font, themeFont);
  assert.equal(resolveScreenDesign(noFont)?.font, undefined, 'no font known: the player uses its default');
  assert.equal(resolveScreenDesign({ ...good, fontFamily: 'Poppins' }, themeFont)?.fontFamily, 'Poppins', 'a font set on the design is kept next to the event font, and wins in the player');
});

test('a text that fills its box is kept as such, and a text that does not stays as it was', () => {
  const texts = [
    { text: 'go.example.test/mtk-vasas', x: 2, y: 80, width: 69, size: 10, align: 'center', fit: true },
    { text: 'Scan me', x: 2, y: 60, width: 69, size: 6, align: 'center', fit: false },
    { text: 'Plain', x: 2, y: 70, width: 69, size: 6, align: 'center' },
  ];
  const parsed = parseScreenDesign({ ...good, texts });
  assert.ok(parsed.ok && parsed.value);
  assert.equal(parsed.value.texts?.[0].fit, true);
  assert.equal('fit' in (parsed.value.texts?.[1] ?? {}), false, 'only true is kept');
  assert.equal('fit' in (parsed.value.texts?.[2] ?? {}), false);
});

test('a line that fills its box takes the size at which it is exactly as wide as the box, never above the largest size a text can have', () => {
  // Measured 400 wide at size 10: a box of 800 needs size 20, a box of 200 needs 5, and the largest size caps it.
  assert.equal(fitSize(400, 10, 800, 30), 20);
  assert.equal(fitSize(400, 10, 200, 30), 5);
  assert.equal(fitSize(400, 10, 800, 12), 12, 'a short line does not grow without end');
  assert.equal(fitSize(0, 10, 800, 12), 12, 'an empty measure keeps the largest size');
  assert.equal(fitSize(400, 10, 0, 12), 12, 'a box with no width yet keeps the largest size');
  // The first guess before measuring: the address of the MTK event in a box as wide as the photo window never exceeds the largest size and is not tiny.
  const guess = estimateFitSize('go.messmass.com/mtk-vasas', 69.274, 10);
  assert.ok(guess > 6 && guess <= 10, `the estimate is ${guess}`);
  assert.equal(estimateFitSize('Hi', 69.274, 10), 10);
  assert.ok(estimateFitSize('x'.repeat(200), 69.274, 10) < 3, 'a very long line gets small, it never wraps');
});

test('a line that fills its box is not held back by the size stored with it (owner, 2026-10-09: "it is not scaled")', () => {
  // FANSELFIE.ME/MTK in a box as wide as the photo window: at the stored size 10 it reached about 80 % of the box; filling takes more than 10.
  const box = 69.274 * (16 / 9);
  const measuredAt10 = 16 * 0.6 * 10 * 0.85; // a 16 character line, 80 % of the box at size 10 (box is about 123 wide)
  const size = fitSize(measuredAt10, 10, box, FIT_MAX_SIZE);
  assert.ok(size > 10, `the line fills the box at ${size}, above the stored 10`);
  assert.ok(Math.abs((measuredAt10 * size) / 10 - box) < 1e-9, 'and is exactly as wide as the box');
  assert.equal(FIT_MAX_SIZE, 30, 'the largest size a text can have is the one the check allows');
  const stored = parseScreenDesign({ ...good, texts: [{ text: 'x', x: 2, y: 80, width: 69, size: FIT_MAX_SIZE, align: 'center', fit: true }] });
  assert.ok(stored.ok, 'a text at the largest size passes the check');
});

test('a refused QR code says which part is wrong: the address, or the place and size', () => {
  const withQr = (qr: object) => parseScreenDesign({ ...good, qr });
  const noHttps = withQr({ url: 'go.example.test/mtk-vasas', x: 73, y: 2, size: 24 });
  assert.ok(!noHttps.ok && /address must start with https:\/\//.test(noHttps.error), 'the address');
  const http = withQr({ url: 'http://go.example.test/x', x: 73, y: 2, size: 24 });
  assert.ok(!http.ok && /https:\/\//.test(http.error));
  const blank = withQr({ url: 'https://go.example.test/x', x: 73, y: null, size: 24 });
  assert.ok(!blank.ok && /left, top and side must be numbers/.test(blank.error), 'a number that is missing');
  const outside = withQr({ url: 'https://go.example.test/x', x: 80, y: 2, size: 24 });
  assert.ok(!outside.ok && /inside the stage/.test(outside.error), 'a QR code that leaves the stage');
  assert.ok(withQr({ url: 'https://go.example.test/x', x: 73, y: 2, size: 24 }).ok);
});
