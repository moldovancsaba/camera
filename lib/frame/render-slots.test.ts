import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { nativeFrameContext, type FrameContext } from './context';
import { resolveFrameFont } from './fonts';
import { renderFrame, renderSlotFrame, slotLayers } from './render';
import { DEFAULT_SLOTS, type FrameSlots } from './slots';

// Real drawing with the real canvas: the default slots against the generated frame pixel for pixel, then structural checks (no exact glyph pixels, so they hold on any machine).

const WHITE = `${CAMERA_STAGE_WHITE}FF`;
const BAR = `${CAMERA_DEFAULT_BRAND_COLOR}FF`;
const BLOB = 'https://abc123.public.blob.vercel-storage.com/frames';

function context(): FrameContext {
  const base = nativeFrameContext({ eventName: 'Fan Day' }, 'now');
  return {
    ...base,
    event: { ...base.event, homeTeam: { id: 'h', name: 'MTK Budapest', shortName: null, logoUrl: null }, visitorTeam: { id: 'v', name: 'Vasas FC', shortName: null, logoUrl: null } },
    partner: { name: 'MTK', logoUrl: null },
    style: { ...base.style, headingColor: WHITE, heroBackground: BAR },
  };
}

const solid = (width: number, height: number, r: number, g: number, b: number) => sharp({ create: { width, height, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();

async function raw(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  return { data, info, at };
}

test('the default slots draw the same pixels as the generated frame', async () => {
  const ctx = context();
  const font = await resolveFrameFont(ctx.style);
  const logoBytes = await solid(200, 150, 200, 30, 30);
  const old = await renderFrame({ context: ctx, message: 'Let’s Go, MTK Budapest', logoBytes, emoji: null, font });
  const next = await renderSlotFrame({ context: ctx, message: 'Let’s Go, MTK Budapest', logoBytes, emoji: null, font, slots: DEFAULT_SLOTS, pictureBytes: {} });
  const a = await raw(old.png);
  const b = await raw(next.png);
  assert.deepEqual([b.info.width, b.info.height], [1920, 1080]);
  assert.ok(a.data.equals(b.data), 'every pixel is the same');
});

test('strips on the top and the bottom edge, a corner picture, an own text with its own colour: drawn where the layout says', async () => {
  const ctx = context();
  const font = await resolveFrameFont(ctx.style);
  const slots: FrameSlots = {
    text: { 'top-center': { source: 'custom', text: 'MTK', colour: `#${'ff0000'}` }, 'bottom-center': { source: 'message' } },
    picture: {
      'top-center': { source: 'picture', images: [{ key: 'top', imageUrl: `${BLOB}/top.png` }] },
      'bottom-center': { source: 'picture', images: [{ key: 'bottom', imageUrl: `${BLOB}/bottom.png` }] },
      'bottom-right': { source: 'picture', images: [{ key: 'ribbon', imageUrl: `${BLOB}/ribbon.png` }] },
    },
  };
  const out = await renderSlotFrame({
    context: ctx,
    message: 'HAJRÁ, MTK!',
    logoBytes: null,
    emoji: null,
    font,
    slots,
    pictureBytes: { 'top-center': await solid(1920, 100, 20, 160, 220), 'bottom-center': await solid(1920, 100, 250, 140, 170), 'bottom-right': await solid(285, 315, 255, 0, 255) },
  });
  const p = await raw(out.png);
  assert.deepEqual(p.at(5, 5), [20, 160, 220, 255], 'the top strip at its natural size');
  assert.deepEqual(p.at(5, 95), [20, 160, 220, 255]);
  assert.equal(p.at(5, 110)[3], 0, 'transparent below it');
  assert.deepEqual(p.at(5, 1075), [250, 140, 170, 255], 'the bottom strip');
  assert.equal(p.at(5, 975)[3], 0);
  const ribbon = out.layout.pictures.find((picture) => picture.id === 'picture-bottom-right')!.rect;
  assert.deepEqual(p.at(Math.round(ribbon.x + ribbon.width / 2), Math.round(ribbon.y + ribbon.height / 2)), [255, 0, 255, 255], 'the corner picture');
  assert.ok(ribbon.y + ribbon.height <= 980, 'above the bottom strip');
  // the own text is red, in the top strip
  const text = out.layout.texts.find((t) => t.source === 'custom')!;
  let red = 0;
  for (let y = Math.floor(text.rect.y); y < text.rect.y + text.rect.height; y += 1) for (let x = Math.floor(text.rect.x); x < text.rect.x + text.rect.width; x += 2) if (p.at(x, y)[0] > 200 && p.at(x, y)[1] < 60 && p.at(x, y)[2] < 60) red += 1;
  assert.ok(red > 40, `red text pixels ${red}`);
  // the message is white, in the bottom strip
  const message = out.layout.texts.find((t) => t.source === 'message')!;
  let white = 0;
  for (let y = Math.floor(message.rect.y); y < message.rect.y + message.rect.height; y += 2) for (let x = Math.floor(message.rect.x); x < message.rect.x + message.rect.width; x += 2) if (p.at(x, y).slice(0, 3).every((v) => v > 240)) white += 1;
  assert.ok(white > 200, `white message pixels ${white}`);
});

test('a picture that cannot be read as an image is reported and left out; the frame is still drawn', async () => {
  const ctx = context();
  const font = await resolveFrameFont(ctx.style);
  const slots: FrameSlots = { text: { 'top-left': { source: 'teams' } }, picture: { 'top-left': { source: 'picture', images: [{ key: 'a', imageUrl: `${BLOB}/a.png` }] } } };
  const out = await renderSlotFrame({ context: ctx, message: null, logoBytes: null, emoji: null, font, slots, pictureBytes: { 'top-left': Buffer.from('not an image') } });
  assert.deepEqual(out.layout.notes, ['The top left picture could not be drawn.']);
  assert.equal(out.layout.pictures.length, 0);
  assert.ok(out.layout.texts.length === 1);
});

test('the dark area of slots is the boxes of what is drawn, by name', async () => {
  const ctx = context();
  const font = await resolveFrameFont(ctx.style);
  const layers = await slotLayers({ context: ctx, message: 'Go', logoBytes: null, emoji: null, font, slots: DEFAULT_SLOTS, pictureBytes: {} });
  assert.deepEqual(layers.map((layer) => layer.id).sort(), ['bar', 'message', 'teams']);
});
