import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { contextHash, nativeFrameContext, type FrameDesign } from './context';
import { resolveFrameFont } from './fonts';
import { previewSlots, type PreviewDeps } from './preview';
import type { FrameSlots } from './slots';

const NOW = '2026-10-09T12:00:00.000Z';
const BLOB = 'https://abc123.public.blob.vercel-storage.com/frames';
const base = nativeFrameContext({ eventName: 'MTK x Vasas' }, NOW);
const design: FrameDesign = { context: { ...base, inputHash: contextHash(base) }, messages: ['HAJRÁ, MTK!', 'Hello {partner1}', 'MTK SZÍV!'], messagesOverridden: true, updatedAt: NOW };
const strip = (r: number) => sharp({ create: { width: 1920, height: 100, channels: 4, background: { r, g: 100, b: 100, alpha: 1 } } }).png().toBuffer();
const deps = (over: Partial<PreviewDeps> = {}): PreviewDeps => ({ fetchLogo: async () => null, fetchBaseImage: async (url) => (url.endsWith('pink.png') ? strip(250) : strip(20)), resolveFont: (style) => resolveFrameFont(style), ...over });

const slots: FrameSlots = {
  text: { 'bottom-center': { source: 'message' } },
  picture: { 'bottom-center': { source: 'picture', images: [{ key: 'blue', imageUrl: `${BLOB}/blue.png` }, { key: 'pink', imageUrl: `${BLOB}/pink.png` }], byMessage: { 'MTK SZÍV!': 'pink' } } },
};

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
}

test('the preview draws the draft with the message asked for and its mapped picture', async () => {
  const blue = await previewSlots(design, slots, 0, deps());
  assert.equal(blue.message, 'HAJRÁ, MTK!');
  assert.deepEqual([blue.width, blue.height], [1920, 1080]);
  assert.deepEqual((await pixel(blue.png, 5, 1075)).slice(0, 3), [20, 100, 100]);
  const pink = await previewSlots(design, slots, 2, deps());
  assert.equal(pink.message, 'MTK SZÍV!');
  assert.deepEqual((await pixel(pink.png, 5, 1075)).slice(0, 3), [250, 100, 100]);
  assert.deepEqual(pink.notes, []);
});

test('a message that cannot be used (no team name) or none given is replaced by the first usable one', async () => {
  assert.equal((await previewSlots(design, slots, 1, deps())).message, 'Hello MTK', 'the sides of the pairing in the name');
  const lone = nativeFrameContext({ eventName: 'Fan Day' }, NOW);
  const noTeams: FrameDesign = { ...design, context: { ...lone, inputHash: contextHash(lone) } };
  assert.equal((await previewSlots(noTeams, slots, 1, deps())).message, 'HAJRÁ, MTK!', 'the message with {partner1} has no team here');
  assert.equal((await previewSlots(design, slots, null, deps())).message, 'HAJRÁ, MTK!');
  assert.equal((await previewSlots(design, slots, 99, deps())).message, 'HAJRÁ, MTK!');
});

test('a picture that cannot be fetched is left out and reported, not an error', async () => {
  const out = await previewSlots(design, slots, 0, deps({ fetchBaseImage: async () => null }));
  assert.deepEqual(out.notes, ['The bottom center picture could not be drawn.']);
  assert.ok(out.png.length > 0);
});
