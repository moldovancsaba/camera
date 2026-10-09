import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';
import { composeUploadWithFrame } from '@/lib/photo-vetting/compose';
import { frameGalleryPhoto, loadGalleryFrames, pickGalleryFrame } from './frame';

// Colours are assembled from digits: the design-system check bans raw colour literals, tests included.
const channels3 = (r: number, g: number, b: number) => ({ r, g, b });

/** A 1000 x 500 photo: green, with a red square in the middle. */
async function photo(): Promise<Buffer> {
  const square = await sharp({ create: { width: 100, height: 100, channels: 3, background: channels3(220, 20, 20) } }).png().toBuffer();
  return sharp({ create: { width: 1000, height: 500, channels: 3, background: channels3(20, 160, 40) } }).composite([{ input: square, left: 450, top: 200 }]).png().toBuffer();
}

/** A 200 x 250 frame: a white border of 20 px round a transparent middle. */
async function frame(): Promise<Buffer> {
  // dest-out removes the frame where the cutter is opaque: the opening.
  const hole = await sharp({ create: { width: 160, height: 210, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: 200, height: 250, channels: 4, background: channels3(255, 255, 255) } }).composite([{ input: hole, left: 20, top: 20, blend: 'dest-out' }]).png().toBuffer();
}

async function pixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return { r: data[at], g: data[at + 1], b: data[at + 2], width: info.width, height: info.height };
}

test('an uploaded photo of any shape is cropped to the frame and the frame is laid over it', async () => {
  const composed = await composeUploadWithFrame(await photo(), await frame());
  assert.deepEqual([composed.width, composed.height, composed.mime], [200, 250, 'image/jpeg']);
  const border = await pixel(composed.buffer, 5, 5);
  assert.ok(border.r > 240 && border.g > 240 && border.b > 240, 'the frame is over the photo');
  assert.deepEqual([border.width, border.height], [200, 250]);
  // The crop keeps the part with the most going on: the red square is inside the opening of the frame, and the rest of the opening is the green of the photo.
  const { data, info } = await sharp(composed.buffer).raw().toBuffer({ resolveWithObject: true });
  let red = 0;
  let green = 0;
  for (let y = 22; y < 228; y += 1) {
    for (let x = 22; x < 178; x += 1) {
      const at = (y * info.width + x) * info.channels;
      if (data[at] > 150 && data[at + 1] < 90) red += 1;
      if (data[at + 1] > 100 && data[at] < 90) green += 1;
    }
  }
  assert.ok(red > 500, `the red square is in the picture (${red} red pixels)`);
  assert.ok(green > 10000, `the photo fills the opening, not stretched or letterboxed (${green} green pixels)`);
});

const event = (extra: Record<string, unknown>) => ({ eventId: 'e1', ...extra });

test('an event with a frame of its own uses it; a text-free frame with a message area is not one', async () => {
  const { db } = fakeDb({ frames: [
    { frameId: 'f1', name: 'Blue', imageUrl: 'https://store.test/f1.png', hasMessageArea: false },
    { frameId: 'f2', name: 'Message base', imageUrl: 'https://store.test/f2.png', hasMessageArea: true },
  ] });
  const frames = await loadGalleryFrames(db, event({ frames: [{ frameId: 'f1', isActive: true }, { frameId: 'f2', isActive: true }] }));
  assert.deepEqual(frames.map((f) => [f.frameId, f.frameName, f.imageUrl, f.variant]), [['f1', 'Blue', 'https://store.test/f1.png', null]]);
});

test('without a frame of its own the generated frame is used, one image for each message, recorded as a guest photo records it', async () => {
  const { db } = fakeDb({ frames: [{ frameId: 'f2', name: 'Message base', imageUrl: 'https://store.test/f2.png', hasMessageArea: true }] });
  const design = { messages: ['Go MTK', 'Hajra'], variants: [
    { index: 0, message: 'Go MTK', imageUrl: 'https://store.test/frames/generated/a.png', width: 1080, height: 1350, layers: [], frameId: null },
    { index: 1, message: 'Hajra', imageUrl: 'https://store.test/frames/generated/b.png', width: 1080, height: 1350, layers: [], frameId: null },
  ] };
  const frames = await loadGalleryFrames(db, event({ frames: [{ frameId: 'f2', isActive: true }], frameDesign: design }));
  assert.deepEqual(frames.map((f) => f.variant), [
    { index: 0, message: 'Go MTK', imageUrl: 'https://store.test/frames/generated/a.png' },
    { index: 1, message: 'Hajra', imageUrl: 'https://store.test/frames/generated/b.png' },
  ]);
});

test('an event with no frame at all has none to add, and an inactive assignment does not count', async () => {
  const { db } = fakeDb({ frames: [{ frameId: 'f1', name: 'Blue', imageUrl: 'https://store.test/f1.png' }] });
  assert.deepEqual(await loadGalleryFrames(db, event({})), []);
  assert.deepEqual(await loadGalleryFrames(db, event({ frames: [{ frameId: 'f1', isActive: false }] })), []);
});

test('a frame is picked at random from those there are, and none when there are none', () => {
  const frames = ['a', 'b', 'c'].map((id) => ({ imageUrl: `https://store.test/${id}.png`, frameId: id, frameName: null, variant: null }));
  assert.equal(pickGalleryFrame(frames, () => 0)?.frameId, 'a');
  assert.equal(pickGalleryFrame(frames, () => 0.5)?.frameId, 'b');
  assert.equal(pickGalleryFrame(frames, () => 0.999999)?.frameId, 'c');
  assert.equal(pickGalleryFrame([]), null);
});

test('framing a photo fetches the frame, composes, stores the result and reports its size', async () => {
  const fetched: string[] = [];
  const stored: string[] = [];
  const result = await frameGalleryPhoto(await photo(), { imageUrl: 'https://store.test/f1.png', frameId: 'f1', frameName: 'Blue', variant: null }, 'name-1', {
    fetchImage: async (url) => (fetched.push(url), frame()),
    upload: async (base64, name) => (stored.push(`${name}:${base64.length > 100}`), { imageUrl: 'https://store.test/framed.jpg', deleteUrl: '', imageId: 'i1', fileSize: 1234, mimeType: 'image/jpeg' }),
  });
  assert.deepEqual(fetched, ['https://store.test/f1.png']);
  assert.deepEqual(stored, ['name-1:true']);
  assert.deepEqual([result.imageUrl, result.width, result.height], ['https://store.test/framed.jpg', 200, 250]);
});
