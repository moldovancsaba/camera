import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_DEFAULT_CTA_BRAND_COLOR, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { nativeFrameContext, type FrameContext } from './context';
import { resolveFrameFont } from './fonts';
import { renderFrame } from './render';

// Structural checks (size, transparency, the bar and line colours, where text and logo land) instead of exact pixels,
// so they hold on any machine's font rasteriser.

const WHITE = `${CAMERA_STAGE_WHITE}FF`;
const BAR = `${CAMERA_DEFAULT_BRAND_COLOR}FF`;

function context(over: Partial<FrameContext['event']> = {}, partner: FrameContext['partner'] = { name: 'FC Barcelona', logoUrl: null }): FrameContext {
  const base = nativeFrameContext({ eventName: 'Fan Day' }, 'now');
  return {
    ...base,
    event: { ...base.event, ...over },
    partner,
    style: { ...base.style, headingColor: WHITE, heroBackground: BAR },
  };
}
const teams = { homeTeam: { id: 'h', name: 'FC Barcelona', shortName: null, logoUrl: null }, visitorTeam: { id: 'v', name: 'Real Madrid', shortName: null, logoUrl: null } };

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  const count = (x0: number, y0: number, x1: number, y1: number, test: (p: number[]) => boolean) => {
    let n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) if (test(at(x, y))) n += 1;
    return n;
  };
  return { info, at, count };
}
const nearWhite = (p: number[]) => p[3] > 200 && p[0] > 230 && p[1] > 230 && p[2] > 230;
const opaque = (p: number[]) => p[3] > 0;

async function render(ctx: FrameContext, message: string | null, logoBytes: Buffer | null = null, emoji: string | null = null) {
  return renderFrame({ context: ctx, message, logoBytes, emoji, font: await resolveFrameFont(ctx.style) });
}

const logoPng = () =>
  sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 220, g: 20, b: 20, alpha: 1 } } })
    .composite([{ input: Buffer.from('<svg width="200" height="200"><rect width="40" height="40" fill="black"/></svg>'), blend: 'dest-out' }])
    .png()
    .toBuffer();

test('the frame is a transparent 1920x1080 PNG: nothing over the picture except the layers', async () => {
  const { png, layout } = await render(context(teams), 'Go! Go! Go!');
  const p = await pixels(png);
  assert.equal(p.info.width, 1920);
  assert.equal(p.info.height, 1080);
  assert.equal(p.info.channels, 4);
  assert.deepEqual([layout.width, layout.height], [1920, 1080]);
  assert.equal(p.at(5, 5)[3], 0);
  assert.equal(p.at(960, 540)[3], 0);
  assert.equal(p.at(1900, 700)[3], 0);
});

test('the bar covers the bottom 20% in the hero colour, with the 1% line above it in the heading colour', async () => {
  const p = await pixels((await render(context(teams), null)).png);
  assert.deepEqual(p.at(10, 1070), [59, 130, 246, 255], 'bar colour (full width, to the bottom)');
  assert.deepEqual(p.at(1910, 868), [59, 130, 246, 255]);
  assert.deepEqual(p.at(10, 858), [255, 255, 255, 255], 'the line');
  assert.deepEqual(p.at(1910, 858), [255, 255, 255, 255], 'the line reaches the sides');
  assert.equal(p.at(10, 850)[3], 0, 'nothing above the line');
});

test('the colours keep their alpha', async () => {
  const half = context(teams);
  half.style.heroBackground = `${CAMERA_DEFAULT_CTA_BRAND_COLOR}80`;
  const p = await pixels((await render(half, null)).png);
  const alpha = p.at(10, 1070)[3];
  assert.ok(alpha > 120 && alpha < 136, `alpha ${alpha}`);
});

test('the teams text is drawn inside its box, left aligned, and nowhere else at the top', async () => {
  const { png, layout } = await render(context(teams), null);
  const p = await pixels(png);
  const box = layout.teams!.rect;
  assert.ok(p.count(box.x, box.y, box.x + box.width, box.y + box.height, nearWhite) > 150, 'text pixels in the box');
  assert.equal(p.count(box.x + box.width + 20, 40, 1600, 400, opaque), 0, 'nothing between the teams box and the logo corner');
  assert.equal(p.count(0, 0, box.x - 10, 400, opaque), 0, 'nothing left of the box');
});

test('without teams the event name is drawn in the same box', async () => {
  const ctx = context({ homeTeam: null, visitorTeam: null, name: 'Spring Fan Festival' });
  const { png, layout } = await render(ctx, null);
  const p = await pixels(png);
  const box = layout.teams!.rect;
  assert.ok(layout.teams!.lines.length >= 1);
  assert.ok(p.count(box.x, box.y, box.x + box.width, box.y + box.height, nearWhite) > 150);
});

test('an event name that is a pairing is drawn as two lines without the separator', async () => {
  const ctx = context({ homeTeam: null, visitorTeam: null, name: 'Casademont Zaragoza - Basket Landes' });
  const { png, layout } = await render(ctx, null);
  const p = await pixels(png);
  const box = layout.teams!.rect;
  assert.deepEqual(layout.teams!.lines, ['Casademont Zaragoza', 'Basket Landes']);
  assert.ok(p.count(box.x, box.y, box.x + box.width, box.y + box.height, nearWhite) > 150);
});

test('the message is drawn over the bar, within the message box; no message, no text there', async () => {
  const withMessage = await render(context(teams), 'Together for Victory!');
  const without = await render(context(teams), null);
  const box = withMessage.layout.message!.rect;
  const a = await pixels(withMessage.png);
  const b = await pixels(without.png);
  assert.ok(a.count(box.x, box.y, box.x + box.width, box.y + box.height, nearWhite) > 300);
  assert.equal(b.count(box.x, box.y, box.x + box.width, box.y + box.height, nearWhite), 0);
  assert.equal(a.count(0, 864, 80, 1080, nearWhite), 0, 'nothing in the safety margin');
});

test('the emoji message is drawn with colour emoji', async () => {
  const { png, layout } = await render(context(teams), '🫶 Let’s Go 🫶');
  const p = await pixels(png);
  const box = layout.message!.rect;
  const yellow = (px: number[]) => px[3] > 200 && px[0] > 200 && px[1] > 140 && px[2] < 110;
  assert.ok(p.count(box.x, box.y, box.x + box.width, box.y + box.height, yellow) > 100, 'colour emoji pixels');
});

test('the logo is drawn as it is: its own transparency stays, nothing is drawn behind it', async () => {
  const withLogo = context(teams, { name: 'FC Barcelona', logoUrl: 'https://i.ibb.co/a/l.png' });
  const { png, layout, logo } = await render(withLogo, null, await logoPng());
  const p = await pixels(png);
  const box = layout.logo!;
  assert.equal(logo, 'drawn');
  assert.deepEqual(box, { x: 1662, y: 54, width: 162, height: 162 });
  assert.deepEqual(p.at(box.x + box.width - 10, box.y + box.height - 10), [220, 20, 20, 255], 'the logo pixels');
  assert.equal(p.at(box.x + 3, box.y + 3)[3], 0, 'the logo\'s transparent corner stays transparent: no box behind it');
  assert.equal(p.at(box.x - 10, box.y + 80)[3], 0);
});

test('a logo with an opaque background keeps it: nothing is cut out of a logo', async () => {
  const opaqueWhite = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  const { png, layout } = await render(context(teams, { name: 'P', logoUrl: 'https://i.ibb.co/a/l.png' }), null, opaqueWhite);
  const p = await pixels(png);
  const box = layout.logo!;
  for (const [x, y] of [[box.x + 1, box.y + 1], [box.x + box.width - 2, box.y + 1], [box.x + 1, box.y + box.height - 2], [box.x + box.width - 2, box.y + box.height - 2], [box.x + 80, box.y + 80]]) {
    assert.deepEqual(p.at(x, y), [255, 255, 255, 255], `${x},${y}`);
  }
});

test('the logo state tells none, drawn and failed apart, and a frame without a logo has nothing in the logo corner', async () => {
  const none = await render(context(teams, { name: 'P', logoUrl: null }), null);
  assert.equal(none.logo, 'none');
  assert.equal(none.layout.logo, null);

  const failed = await render(context(teams, { name: 'P', logoUrl: 'https://i.ibb.co/a/l.png' }), null, null);
  assert.equal(failed.logo, 'failed');
  const garbage = await render(context(teams, { name: 'P', logoUrl: 'https://i.ibb.co/a/l.png' }), null, Buffer.from('not an image'));
  assert.equal(garbage.logo, 'failed');
  const p = await pixels(failed.png);
  assert.equal(p.count(1500, 40, 1900, 260, opaque), 0);
});

const coloured = (p: number[]) => p[3] > 200 && Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) > 40;

test('with no logo the event emoji is drawn in the logo box, in colour, at the top right of the safety area', async () => {
  const { png, layout, logo } = await render(context({ name: '⚽ DVTK x Kazincbarcika', homeTeam: null, visitorTeam: null }, { name: 'SEYU', logoUrl: null }), null, null, '⚽');
  const p = await pixels(png);
  assert.equal(logo, 'emoji');
  const box = layout.logo!;
  assert.ok(box, 'the logo layer exists, so the live view has its territory');
  assert.ok(Math.abs(box.x + box.width - 1824) < 1 && Math.abs(box.y - 54) < 1, 'anchored top right of the safety area');
  assert.ok(box.height <= 162.01 && box.width <= 288.01);
  assert.ok(p.count(box.x, box.y, box.x + box.width, box.y + box.height, coloured) + p.count(box.x, box.y, box.x + box.width, box.y + box.height, nearWhite) > 200, 'something is drawn there');
  assert.equal(p.count(1200, 40, box.x - 20, 260, opaque), 0, 'nothing else between the teams text and the emoji');
});

test('a wide emoji keeps its shape in the box: a flag is wider than tall, a ball is square', async () => {
  const flag = await render(context(teams, { name: 'P', logoUrl: null }), null, null, '🇭🇺');
  const ball = await render(context(teams, { name: 'P', logoUrl: null }), null, null, '⚽');
  assert.ok(flag.layout.logo!.width > flag.layout.logo!.height * 1.15, `${flag.layout.logo!.width} x ${flag.layout.logo!.height}`);
  assert.ok(Math.abs(ball.layout.logo!.width - ball.layout.logo!.height) < 3);
});

test('a real logo wins over the emoji, and no emoji means no logo as before', async () => {
  const withLogo = await render(context(teams, { name: 'P', logoUrl: 'https://i.ibb.co/a/l.png' }), null, await logoPng(), '⚽');
  assert.equal(withLogo.logo, 'drawn');
  const none = await render(context(teams, { name: 'P', logoUrl: null }), null, null, null);
  assert.equal(none.logo, 'none');
  assert.equal(none.layout.logo, null);
});

test('a logo that could not be fetched still counts as failed (so it is retried) while the emoji stands in for it', async () => {
  const failed = await render(context(teams, { name: 'P', logoUrl: 'https://i.ibb.co/a/l.png' }), null, null, '🏀');
  assert.equal(failed.logo, 'failed');
  assert.ok(failed.layout.logo, 'the emoji is drawn meanwhile');
});
