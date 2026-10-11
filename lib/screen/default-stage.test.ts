import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_DEFAULT_CTA_BRAND_COLOR, CAMERA_STAGE_BLACK, CAMERA_STAGE_QR_DARK, CAMERA_STAGE_WHITE, LANDING_PAGE_BASE_BACKGROUND, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { BACKGROUND_VEIL, DEFAULT_STAGE, STAGE_HEIGHT, STAGE_WIDTH, renderDefaultOverlay, renderStageOverlay, stagePalette } from './default-stage';

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
  const { window, qr, addressText, qrText } = DEFAULT_STAGE;
  const boxes = {
    window: [window.left, window.top, window.left + window.width, window.top + window.height],
    qr: [qr.x, qr.y, qr.x + qr.size, qr.y + (qr.size * STAGE_WIDTH) / STAGE_HEIGHT],
    addressText: [addressText.x, addressText.y, addressText.x + addressText.width, addressText.y + addressText.size * 1.15],
    qrText: [qrText.x, qrText.y, qrText.x + qrText.width, qrText.y + qrText.size * 1.15],
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


// ---- on a stadium background (issue 326) ----

const solidBackground = (r: number, g: number, b: number, width = 1600, height = 900) => sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).png().toBuffer();

test('with no stadium background the stage is exactly the one drawn by code: the same bytes, so every event keeps its picture and its address', async () => {
  assert.ok((await renderStageOverlay(NAVY, null)).equals(renderDefaultOverlay(NAVY)));
  assert.ok((await renderStageOverlay(LIGHT, null)).equals(renderDefaultOverlay(LIGHT)));
});

test('on a stadium background the event\'s colours lie over it: at the top of the stage the picture shows by the veil and the page colour, in the proportion the veil says', async () => {
  const [pr, pg, pb] = [200, 40, 40];
  const png = await renderStageOverlay(NAVY, await solidBackground(pr, pg, pb));
  const top = await pixel(png, STAGE_WIDTH / 2, 3);
  const page = rgbOf(NAVY.background);
  const expected = [pr, pg, pb].map((channel, i) => channel * (1 - BACKGROUND_VEIL) + page[i] * BACKGROUND_VEIL);
  for (const [i, channel] of [top.r, top.g, top.b].entries()) assert.ok(Math.abs(channel - expected[i]) <= 3, `channel ${i}: ${channel} is near ${Math.round(expected[i])}`);
  assert.equal(top.a, 255);
  assert.ok(top.r > top.g + 40, 'the red stadium still shows through the page colour');
});

test('on a stadium background the panels, the QR panel and the photo window are drawn as on the built-in stage: the window is a transparent hole, the QR panel is white, the window border is the accent', async () => {
  const png = await renderStageOverlay(NAVY, await solidBackground(30, 160, 60));
  const w = DEFAULT_STAGE.window;
  const centre = await pixel(png, px(w.left + w.width / 2, STAGE_WIDTH), px(w.top + w.height / 2, STAGE_HEIGHT));
  assert.equal(centre.a, 0, 'the photos show through the window');
  const border = await pixel(png, px(w.left, STAGE_WIDTH) - 5, px(w.top + w.height / 2, STAGE_HEIGHT));
  assert.deepEqual([border.r, border.g, border.b], rgbOf(NAVY.accent));
  const q = DEFAULT_STAGE.qr;
  const panel = await pixel(png, px(q.x, STAGE_WIDTH) - 8, px(q.y, STAGE_HEIGHT) + 100);
  assert.deepEqual([panel.r, panel.g, panel.b, panel.a], [255, 255, 255, 255]);
  // The panels of the right column and the band are 85 % opaque in both stages: over a stadium they let it show a little, so only that they are there is compared.
  const built = renderDefaultOverlay(NAVY);
  for (const [x, y] of [[px(80, STAGE_WIDTH), px(50, STAGE_HEIGHT)], [px(10, STAGE_WIDTH), px(78.6 + 3, STAGE_HEIGHT)]] as const) {
    const a = await pixel(png, x, y);
    const b = await pixel(built, x, y);
    assert.equal(a.a, b.a, `the panel is there at ${Math.round(x)},${Math.round(y)}`);
    assert.ok(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 160, 'and it is the same colour, with the stadium showing a little through');
  }
});

test('a picture of another shape fills the stage, cropped, and the same inputs give the same stage', async () => {
  const portrait = await solidBackground(20, 20, 200, 600, 1200);
  const a = await renderStageOverlay(NAVY, portrait);
  const b = await renderStageOverlay(NAVY, portrait);
  assert.ok(a.equals(b));
  const corner = await pixel(a, STAGE_WIDTH / 2, STAGE_HEIGHT - 3);
  assert.equal(corner.a, 255, 'no uncovered edge');
});

test('the QR text goes in the panel of the right column, above the QR code, as wide as the QR code, clear of the white QR panel', () => {
  const { qr, qrText } = DEFAULT_STAGE;
  assert.equal(qrText.x, qr.x);
  assert.equal(qrText.width, qr.size);
  const textBottom = qrText.y + qrText.size * 1.15;
  const whitePanelTop = qr.y - (18 / STAGE_HEIGHT) * 100;
  assert.ok(textBottom < whitePanelTop, 'the line ends above the white panel of the QR code');
  assert.ok(qrText.y > 2, 'and starts inside the column\'s panel, which starts at 2 % of the height');
});
