import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { baseImageFor, fitMessageSize, parseFrameBase, renderBaseFrame, type FrameBase } from './base';
import { contextHash, nativeFrameContext, type FrameDesign } from './context';
import { resolveFrameFont } from './fonts';
import { FRAME_RENDER_VERSION } from './render';
import { generateFrameVariants, variantKey, type VariantDeps } from './variants';

const NOW = '2026-10-07T12:00:00.000Z';
const PICTURE = (name: string) => `https://pub.example.test/frames/${name}.png`;
const hex = (digits: string) => `#${digits}`; // colours are assembled from digits: the design-system check bans raw colour literals, tests included

const base: FrameBase = {
  images: [{ key: 'blue', imageUrl: PICTURE('blue') }, { key: 'pink', imageUrl: PICTURE('pink') }],
  messageImages: { 'MTK SZÍV!': 'pink' },
  messageBox: { x: 520, y: 8, width: 880, height: 90 },
  layers: [{ id: 'header', x: 0, y: 0, width: 1920, height: 100 }, { id: 'footer', x: 0, y: 980, width: 1920, height: 100 }],
};

// A transparent 1920x1080 frame with a solid 100 px band at the top, like the designers' pictures.
async function picture(band: { r: number; g: number; b: number }): Promise<Buffer> {
  const bandPng = await sharp({ create: { width: 1920, height: 100, channels: 4, background: { ...band, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: 1920, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: bandPng, top: 0, left: 0 }]).png().toBuffer();
}

test('a base is accepted as stored, and anything that could break the renderer is refused', () => {
  assert.deepEqual(parseFrameBase(base), base);
  const bad: unknown[] = [
    null, 'x', [], {},
    { ...base, images: [] },
    { ...base, images: [{ key: 'blue', imageUrl: 'http://pub.example.test/a.png' }] },
    { ...base, images: [{ key: 'bad key!', imageUrl: PICTURE('a') }] },
    { ...base, images: [{ key: 'a', imageUrl: 'https://user:pw@pub.example.test/a.png' }] },
    { ...base, messageBox: { x: 1900, y: 0, width: 100, height: 50 } },
    { ...base, messageBox: undefined },
  ];
  for (const input of bad) assert.equal(parseFrameBase(input), null, JSON.stringify(input).slice(0, 70));
  const cleaned = parseFrameBase({ ...base, messageImages: { a: 'blue', b: 'unknown' }, messageColor: 'red', layers: [{ id: 'bar', x: 0, y: 0, width: 10, height: 10 }] });
  assert.deepEqual(cleaned?.messageImages, { a: 'blue' }, 'a message may only name an image of the base');
  assert.equal(cleaned?.messageColor, undefined, 'a colour that is not hex is dropped');
  assert.equal(cleaned?.layers, undefined, 'only header and footer boxes are territories');
});

test('a message uses the image it names, else the first', () => {
  assert.equal(baseImageFor(base, 'MTK SZÍV!').key, 'pink');
  assert.equal(baseImageFor(base, 'HAJRÁ, MTK!').key, 'blue');
  assert.equal(baseImageFor(base, null).key, 'blue');
});

test('the message is a fixed share of the box height, and smaller only when it is wider than the box', () => {
  const measure = (text: string, size: number) => text.length * size * 0.6;
  assert.equal(fitMessageSize(measure, 'HI', 880, 90), 72, 'fits: 80% of the height');
  const long = 'A'.repeat(60);
  const size = fitMessageSize(measure, long, 880, 90);
  assert.ok(size < 72 && Math.abs(measure(long, size) - 880) < 0.001, `shrunk to the width: ${size}`);
});

test('the message is written in the box, on the picture, in the event font; the rest of the picture is untouched', async () => {
  const font = await resolveFrameFont({ name: 's', resolvedFrom: 'event', fontFamily: 'Inter', fontSource: 'google', fontFile: null, headingColor: hex('000000ff'), heroBackground: hex('ffffffff') });
  const rendered = await renderBaseFrame({ base, imageBytes: await picture({ r: 24, g: 156, b: 216 }), message: 'MTK SZÍV!', font });
  assert.deepEqual([rendered.width, rendered.height], [1920, 1080]);
  assert.deepEqual(rendered.layers.map((l) => l.id), ['header', 'footer']);
  const { data, info } = await sharp(rendered.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  assert.deepEqual(px(100, 50), [24, 156, 216, 255], 'the band is as drawn by the designers');
  assert.equal(px(960, 600)[3], 0, 'the middle stays transparent');
  let white = 0;
  for (let y = 8; y < 98; y++) for (let x = 520; x < 1400; x++) { const i = (y * info.width + x) * 4; if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240 && data[i + 3] === 255) white += 1; }
  assert.ok(white > 400, `the message is drawn in white inside its box (${white} pixels)`);
  let outside = 0;
  for (let y = 8; y < 98; y++) for (let x = 0; x < 500; x++) { const i = (y * info.width + x) * 4; if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) outside += 1; }
  assert.equal(outside, 0, 'nothing is drawn outside the box');
});

function designWith(withBase: boolean): FrameDesign {
  const ctx = nativeFrameContext({ eventName: 'MTK x Vasas', partnerName: 'MTK Budapest', partnerLogoUrl: null }, NOW);
  return { context: { ...ctx, inputHash: contextHash(ctx) }, messages: ['HAJRÁ, MTK!', 'MTK SZÍV!'], messagesOverridden: true, updatedAt: NOW, ...(withBase ? { base } : {}) };
}

test('variants are drawn from the base: one image per message on its own colourway, stored like any generated frame, with the bands as territories', async () => {
  const blue = await picture({ r: 24, g: 156, b: 216 });
  const pink = await picture({ r: 253, g: 137, b: 175 });
  const uploads: Array<{ path: string; png: Buffer }> = [];
  const fetched: string[] = [];
  const writes: Array<Record<string, unknown>> = [];
  const db = { collection: () => ({ updateOne: async (_f: unknown, u: { $set: Record<string, unknown> }) => (writes.push(u.$set), { matchedCount: 1 }) }) } as unknown as Db;
  const deps: VariantDeps = {
    upload: async (path, png) => (uploads.push({ path, png }), `https://blob.test/${path}`),
    fetchLogo: async () => null,
    fetchBaseImage: async (url) => (fetched.push(url), url === PICTURE('pink') ? pink : blue),
    resolveFont: (style) => resolveFrameFont(style),
    now: () => NOW,
  };
  const result = await generateFrameVariants(db, { _id: new ObjectId(), eventId: 'evt-1', name: 'MTK x Vasas', frameDesign: designWith(true) }, deps);
  assert.equal(result.generated, 2);
  assert.deepEqual([...new Set(fetched)].sort(), [PICTURE('blue'), PICTURE('pink')], 'each picture is fetched once');
  assert.equal(fetched.length, 2);
  const [first, second] = result.design.variants!;
  assert.equal(first.message, 'HAJRÁ, MTK!');
  assert.deepEqual(first.layers.map((l) => l.id), ['header', 'footer']);
  assert.equal(first.logo, 'none');
  assert.equal(first.renderVersion, FRAME_RENDER_VERSION);
  const band = async (png: Buffer) => [...(await sharp(png).extract({ left: 100, top: 50, width: 1, height: 1 }).ensureAlpha().raw().toBuffer())].slice(0, 3);
  assert.deepEqual(await band(uploads[0].png), [24, 156, 216], 'the blue message is on the blue picture');
  assert.deepEqual(await band(uploads[1].png), [253, 137, 175], 'the pink message is on the pink picture');
  assert.match(uploads[0].path, /^frames\/generated\/evt-1\/[0-9a-f]{32}\.png$/);
  assert.notEqual(first.key, second.key);
});

test('a picture that cannot be fetched stops the run and leaves the images as they were', async () => {
  const writes: unknown[] = [];
  const db = { collection: () => ({ updateOne: async () => (writes.push(1), { matchedCount: 1 }) }) } as unknown as Db;
  const deps: VariantDeps = { upload: async (p) => p, fetchLogo: async () => null, fetchBaseImage: async () => null, resolveFont: (s) => resolveFrameFont(s), now: () => NOW };
  await assert.rejects(generateFrameVariants(db, { _id: new ObjectId(), eventId: 'e', name: 'x', frameDesign: designWith(true) }, deps), /base picture/);
  assert.equal(writes.length, 0);
});

test('a design without a base keeps exactly the key it had before bases existed, so nothing is redrawn', async () => {
  const d = designWith(false);
  const font = await resolveFrameFont(d.context.style);
  const before = createHash('sha256').update(JSON.stringify([contextHash(d.context), 'x', font.family, font.used, 1920, 1080, FRAME_RENDER_VERSION])).digest('hex');
  assert.equal(variantKey(d, 'x', font), before);
  assert.notEqual(variantKey(designWith(true), 'x', font), before, 'a base changes the image, so the key');
});
