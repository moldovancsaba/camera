import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { composePhotoWithFrame } from './compose';

const solid = (width: number, height: number, background: { r: number; g: number; b: number; alpha?: number }) =>
  sharp({ create: { width, height, channels: 4, background: { alpha: 1, ...background } } }).png().toBuffer();

test('the frame is laid over the photo and the picture keeps the size of the photo', async () => {
  const photo = await solid(200, 100, { r: 0, g: 200, b: 0 });
  // A frame at another size whose left half is opaque red and right half fully transparent.
  const frame = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await solid(20, 20, { r: 255, g: 0, b: 0 }), left: 0, top: 0 }])
    .png()
    .toBuffer();
  const composed = await composePhotoWithFrame(photo, frame);
  assert.equal(composed.mime, 'image/jpeg');
  assert.deepEqual([composed.width, composed.height], [200, 100]);
  const { data, info } = await sharp(composed.buffer).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  const [lr, lg] = pixel(20, 50);
  const [rr, rg] = pixel(180, 50);
  assert.ok(lr > 200 && lg < 60, 'the opaque left half of the frame covers the photo');
  assert.ok(rr < 60 && rg > 150, 'the transparent right half shows the photo');
});

test('something that is not an image is refused', async () => {
  await assert.rejects(composePhotoWithFrame(Buffer.from('not an image'), Buffer.from('nor this')));
});
