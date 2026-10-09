import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_DEFAULT_CTA_BRAND_COLOR, CAMERA_STAGE_BLACK, CAMERA_STAGE_QR_DARK, CAMERA_STAGE_WHITE, LANDING_PAGE_BASE_BACKGROUND, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { DEFAULT_STAGE, STAGE_HEIGHT, STAGE_WIDTH, renderDefaultOverlay, stagePalette } from './default-stage';

// Colours come from the tokens (the colour rule keeps raw values out of other files): a dark event and a light event.
const NAVY = { background: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, accent: CAMERA_DEFAULT_CTA_BRAND_COLOR };
const LIGHT = { background: LANDING_PAGE_BASE_BACKGROUND, accent: CAMERA_DEFAULT_BRAND_COLOR };
const rgbOf = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (Math.round(y) * info.width + Math.round(x)) * 4;
  return { r: data[at], g: data[at + 1], b: data[at + 2], a: data[at + 3], width: info.width, height: info.height };
}
const px = (percent: number, of: number) => (percent / 100) * of;

test('the picture is 1920 x 1080 and transparent in the middle of the photo window, opaque around it', async () => {
  const png = renderDefaultOverlay(NAVY);
  const w = DEFAULT_STAGE.window;
  const centre = await pixel(png, px(w.left + w.width / 2, STAGE_WIDTH), px(w.top + w.height / 2, STAGE_HEIGHT));
  assert.equal(centre.width, STAGE_WIDTH);
  assert.equal(centre.height, STAGE_HEIGHT);
  assert.equal(centre.a, 0, 'the photos show through the window');
  assert.equal((await pixel(png, 4, 4)).a, 255, 'the corner of the stage is painted');
  assert.equal((await pixel(png, px(w.left, STAGE_WIDTH) - 5, px(w.top + w.height / 2, STAGE_HEIGHT))).a, 255, 'the border of the window is painted');
});

test('the window border is the event\'s accent colour and the QR code sits on a white panel', async () => {
  const png = renderDefaultOverlay(NAVY);
  const w = DEFAULT_STAGE.window;
  const border = await pixel(png, px(w.left, STAGE_WIDTH) - 5, px(w.top + w.height / 2, STAGE_HEIGHT));
  assert.deepEqual([border.r, border.g, border.b], rgbOf(NAVY.accent));
  const q = DEFAULT_STAGE.qr;
  const panel = await pixel(png, px(q.x, STAGE_WIDTH) - 8, px(q.y, STAGE_HEIGHT) + 100);
  assert.deepEqual([panel.r, panel.g, panel.b, panel.a], [255, 255, 255, 255]);
});

test('the page colour shows at the top of the stage and gets deeper towards the bottom, like a stadium at night', async () => {
  const png = renderDefaultOverlay(NAVY);
  const top = await pixel(png, STAGE_WIDTH / 2, 3);
  const bottom = await pixel(png, STAGE_WIDTH / 2, STAGE_HEIGHT - 3);
  const brightness = (p: { r: number; g: number; b: number }) => p.r + p.g + p.b;
  assert.ok(brightness(bottom) < brightness(top));
});

test('the same colours give the same picture; other colours give another', () => {
  assert.ok(renderDefaultOverlay(NAVY).equals(renderDefaultOverlay(NAVY)));
  assert.ok(!renderDefaultOverlay(NAVY).equals(renderDefaultOverlay(LIGHT)));
});

test('the texts are readable on the panel: white on a dark event, black on a light one; the QR is dark on its light panel', () => {
  assert.equal(stagePalette(NAVY).text.toLowerCase(), CAMERA_STAGE_WHITE.toLowerCase());
  assert.equal(stagePalette(LIGHT).text.toLowerCase(), CAMERA_STAGE_BLACK.toLowerCase());
  assert.equal(stagePalette(NAVY).qr, CAMERA_STAGE_QR_DARK);
  assert.equal(stagePalette(NAVY).qrPanel, CAMERA_STAGE_WHITE);
});

test('every part sits inside the stage and the parts do not overlap each other', () => {
  const { window, qr, addressText } = DEFAULT_STAGE;
  const boxes = {
    window: [window.left, window.top, window.left + window.width, window.top + window.height],
    qr: [qr.x, qr.y, qr.x + qr.size, qr.y + (qr.size * STAGE_WIDTH) / STAGE_HEIGHT],
    addressText: [addressText.x, addressText.y, addressText.x + addressText.width, addressText.y + addressText.size * 1.15],
  };
  for (const [name, [l, t, r, b]] of Object.entries(boxes)) assert.ok(l >= 0 && t >= 0 && r <= 100 && b <= 100, `${name} is inside the stage`);
  const overlap = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const names = Object.keys(boxes) as Array<keyof typeof boxes>;
  for (let i = 0; i < names.length; i += 1) for (let j = i + 1; j < names.length; j += 1) assert.equal(overlap(boxes[names[i]], boxes[names[j]]), false, `${names[i]} and ${names[j]}`);
});

test('the written address is the one big line under the photos, as wide as the window, with the QR code centred in its own panel (owner, 2026-10-09)', () => {
  const { window, qr, addressText } = DEFAULT_STAGE;
  assert.ok(addressText.y > window.top + window.height, 'the line is under the window');
  assert.equal(addressText.x, window.left);
  assert.equal(addressText.width, window.width, 'the text box is as wide as the window');
  const qrHeight = (qr.size * STAGE_WIDTH) / STAGE_HEIGHT;
  assert.ok(Math.abs(qr.y - (2 + (96 - qrHeight) / 2)) < 0.05, 'the QR code is centred in the panel that spans 2 % to 98 % of the height');
});

test('the band under the window is painted behind the address line and ends under it', async () => {
  const png = renderDefaultOverlay(NAVY);
  const t = DEFAULT_STAGE.addressText;
  const inside = await pixel(png, px(t.x + 1, STAGE_WIDTH), px(t.y + (t.size * 1.15) / 2, STAGE_HEIGHT));
  assert.equal(inside.a, 255);
  const below = await pixel(png, px(10, STAGE_WIDTH), px(t.y + t.size * 1.15 + 3, STAGE_HEIGHT));
  const panelPixel = await pixel(png, px(10, STAGE_WIDTH), px(t.y + 1, STAGE_HEIGHT));
  assert.notDeepEqual([below.r, below.g, below.b], [panelPixel.r, panelPixel.g, panelPixel.b], 'the band ends under the address');
});

