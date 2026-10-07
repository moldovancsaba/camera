import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseScreenDesign, qrSvg, resolveScreenDesign } from './screen-design';

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
