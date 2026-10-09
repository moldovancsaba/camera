import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { CAMERA_DEFAULT_CTA_BRAND_COLOR, CAMERA_STAGE_QR_DARK, CAMERA_STAGE_WHITE, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { resolveFrameFont } from '@/lib/frame/fonts';
import type { ScreenDesign } from '@/lib/slideshow/screen-design';
import { DEFAULT_STAGE, STAGE_HEIGHT, STAGE_WIDTH, renderDefaultOverlay, stagePalette } from './default-stage';
import { renderWelcomeScreen, type WelcomeScreenSources } from './welcome-screen';

const COLOURS = { background: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, accent: CAMERA_DEFAULT_CTA_BRAND_COLOR };
const rgbOf = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const px = (percent: number, of: number) => (percent / 100) * of;

const palette = stagePalette(COLOURS);
const design: ScreenDesign = {
  overlayImageUrl: 'https://example.com/overlay.png',
  window: { ...DEFAULT_STAGE.window },
  photoFit: 'cover',
  qr: { url: 'https://go.messmass.com/abc123', x: DEFAULT_STAGE.qr.x, y: DEFAULT_STAGE.qr.y, size: DEFAULT_STAGE.qr.size, color: CAMERA_STAGE_QR_DARK },
  texts: [
    { text: 'Scan & smile', x: DEFAULT_STAGE.qrText.x, y: DEFAULT_STAGE.qrText.y, width: DEFAULT_STAGE.qrText.width, size: DEFAULT_STAGE.qrText.size, align: 'center', color: palette.text },
    { text: 'go.messmass.com/abc123', x: DEFAULT_STAGE.urlText.x, y: DEFAULT_STAGE.urlText.y, width: DEFAULT_STAGE.urlText.width, size: DEFAULT_STAGE.urlText.size, align: 'center', color: palette.text },
  ],
};

async function sources(extra: Partial<WelcomeScreenSources> = {}): Promise<WelcomeScreenSources> {
  const font = await resolveFrameFont({ name: 'x', resolvedFrom: 'x', fontFamily: 'Inter', fontSource: 'system', fontFile: null, headingColor: CAMERA_STAGE_WHITE, heroBackground: CAMERA_STAGE_WHITE });
  return { design, overlay: renderDefaultOverlay(COLOURS), windowPicture: null, frame: null, fontStack: font.stack, colours: COLOURS, ...extra };
}

async function raw(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (Math.round(y) * info.width + Math.round(x)) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  return { info, at, data };
}

const solid = (r: number, g: number, b: number, size = 64) => sharp({ create: { width: size, height: size, channels: 3, background: { r, g, b } } }).png().toBuffer();

/** How many pixels of the rectangle (in percent of the stage) are close to `target`. */
async function countNear(png: Buffer, box: { x: number; y: number; w: number; h: number }, target: number[], tolerance = 40): Promise<number> {
  const { data, info } = await raw(png);
  let n = 0;
  for (let y = Math.floor(px(box.y, STAGE_HEIGHT)); y < px(box.y + box.h, STAGE_HEIGHT); y += 2) {
    for (let x = Math.floor(px(box.x, STAGE_WIDTH)); x < px(box.x + box.w, STAGE_WIDTH); x += 2) {
      const i = (y * info.width + x) * 4;
      if (Math.abs(data[i] - target[0]) < tolerance && Math.abs(data[i + 1] - target[1]) < tolerance && Math.abs(data[i + 2] - target[2]) < tolerance) n += 1;
    }
  }
  return n;
}

test('the picture is 1920 x 1080 and opaque everywhere: the window is filled, never a hole', async () => {
  const png = await renderWelcomeScreen(await sources());
  const { info, at } = await raw(png);
  assert.deepEqual([info.width, info.height], [STAGE_WIDTH, STAGE_HEIGHT]);
  const w = DEFAULT_STAGE.window;
  assert.equal(at(px(w.left + w.width / 2, STAGE_WIDTH), px(w.top + w.height / 2, STAGE_HEIGHT))[3], 255, 'the stand-in fills the window');
  assert.equal(at(4, 4)[3], 255);
});

test('a given photo fills the window (cropped to it) and the frame is drawn over it', async () => {
  const red = await solid(200, 30, 30);
  const w = DEFAULT_STAGE.window;
  const centre = (png: Buffer) => raw(png).then(({ at }) => at(px(w.left + w.width / 2, STAGE_WIDTH), px(w.top + w.height / 2, STAGE_HEIGHT)));
  const photo = await centre(await renderWelcomeScreen(await sources({ windowPicture: red })));
  assert.deepEqual(photo.slice(0, 3), [200, 30, 30]);
  // A frame with one opaque white block covering the middle hides the photo there.
  const frame = await sharp({ create: { width: 1920, height: 1080, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  const framed = await centre(await renderWelcomeScreen(await sources({ windowPicture: red, frame })));
  assert.deepEqual(framed.slice(0, 3), [255, 255, 255]);
});

test('the QR code is drawn on its panel: dark modules and light gaps in the QR box', async () => {
  const png = await renderWelcomeScreen(await sources());
  const q = DEFAULT_STAGE.qr;
  const box = { x: q.x, y: q.y, w: q.size, h: (q.size * STAGE_WIDTH) / STAGE_HEIGHT };
  const dark = await countNear(png, box, rgbOf(CAMERA_STAGE_QR_DARK), 30);
  const light = await countNear(png, box, rgbOf(CAMERA_STAGE_WHITE), 30);
  assert.ok(dark > 2000, `dark modules were drawn (${dark})`);
  assert.ok(light > 2000, `light gaps remain (${light})`);
  // About half of a QR code is dark.
  assert.ok(dark / (dark + light) > 0.3 && dark / (dark + light) < 0.7);
});

test('the texts are drawn in their colour inside their boxes: the call to action and the written address', async () => {
  const png = await renderWelcomeScreen(await sources());
  const text = rgbOf(palette.text);
  const q = DEFAULT_STAGE.qrText;
  const u = DEFAULT_STAGE.urlText;
  assert.ok((await countNear(png, { x: q.x, y: q.y, w: q.width, h: (q.size * STAGE_HEIGHT) / STAGE_WIDTH * 1.3 }, text, 30)) > 300, 'the call to action');
  assert.ok((await countNear(png, { x: u.x, y: u.y, w: u.width, h: (u.size * STAGE_HEIGHT) / STAGE_WIDTH * 1.3 }, text, 30)) > 500, 'the address');
});

test('the same sources give the same picture; another QR address gives another', async () => {
  const a = await renderWelcomeScreen(await sources());
  assert.ok(a.equals(await renderWelcomeScreen(await sources())));
  const other: ScreenDesign = { ...design, qr: { ...design.qr!, url: 'https://go.messmass.com/zzz999' } };
  assert.ok(!a.equals(await renderWelcomeScreen(await sources({ design: other }))));
});

