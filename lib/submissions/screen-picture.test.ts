import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';
import { SCREEN_PICTURE_LONG_EDGE, ensureScreenPicture, makeScreenPicture, screenPicturePath, type ScreenPictureDeps } from './screen-picture';

/** A noisy photo (noise does not compress, so it is heavy like a real one). */
const photo = (width: number, height: number, quality = 92) =>
  sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer();

test('a big photo becomes a WebP of at most 1920 px on its longest edge, much lighter, and keeps its shape', async () => {
  const source = await photo(3000, 2000);
  const picture = await makeScreenPicture(source);
  assert.deepEqual([picture.width, picture.height], [1920, 1280]);
  const meta = await sharp(picture.buffer).metadata();
  assert.equal(meta.format, 'webp');
  assert.ok(picture.buffer.length < source.length * 0.6, `${picture.buffer.length} bytes against ${source.length}`);
});

test('a tall photo is limited on its height, and a small one is not enlarged', async () => {
  const tall = await makeScreenPicture(await photo(1500, 3000));
  assert.deepEqual([tall.width, tall.height], [960, SCREEN_PICTURE_LONG_EDGE]);
  const small = await makeScreenPicture(await photo(640, 360));
  assert.deepEqual([small.width, small.height], [640, 360]);
});

function world(source: Buffer | null, fail = false) {
  const id = new ObjectId();
  const seeded = fakeDb({ submissions: [{ _id: id, imageUrl: 'https://store.test/a.jpg', finalImageUrl: 'https://store.test/a.jpg' }] });
  const puts: Array<{ pathname: string; bytes: number; options: { contentType: string; cacheControlMaxAge: number } }> = [];
  const fetched: string[] = [];
  const deps: ScreenPictureDeps = {
    fetchImage: async (url) => {
      fetched.push(url);
      if (fail || !source) throw new Error('the picture could not be fetched');
      return source;
    },
    put: async (pathname, body, options) => {
      puts.push({ pathname, bytes: body.length, options });
      return { url: `https://store.test/${pathname}` };
    },
  };
  const row = () => seeded.data.submissions.find((s) => String(s._id) === String(id)) as Record<string, unknown>;
  return { id, db: seeded.db, deps, puts, fetched, row };
}

test('a heavy photo gets its screen picture stored once, with a year-long cache, and named on the submission', async () => {
  const w = world(await photo(3000, 2000));
  const result = await ensureScreenPicture(w.db, { _id: w.id, imageUrl: 'https://store.test/a.jpg', finalImageUrl: 'https://store.test/a.jpg' }, w.deps);
  assert.equal(result.outcome, 'made');
  assert.equal(w.puts.length, 1);
  assert.match(w.puts[0].pathname, new RegExp(`^screen-pictures/${String(w.id)}-[0-9a-f]{12}\\.webp$`));
  assert.deepEqual(w.puts[0].options, { contentType: 'image/webp', cacheControlMaxAge: 31_536_000 });
  assert.equal(w.row().screenImageUrl, `https://store.test/${w.puts[0].pathname}`);
  assert.equal(w.row().screenImageBytes, w.puts[0].bytes);
  assert.equal(w.row().imageUrl, 'https://store.test/a.jpg', 'the original is never changed');
});

test('a photo that already has its screen picture is not looked at again', async () => {
  const w = world(await photo(3000, 2000));
  const result = await ensureScreenPicture(w.db, { _id: w.id, imageUrl: 'https://store.test/a.jpg', screenImageUrl: 'https://store.test/done.webp' }, w.deps);
  assert.equal(result.outcome, 'exists');
  assert.deepEqual([w.fetched.length, w.puts.length], [0, 0]);
});

test('a photo that is already small names its own picture and nothing is uploaded', async () => {
  const w = world(await photo(800, 450, 60));
  const result = await ensureScreenPicture(w.db, { _id: w.id, imageUrl: 'https://store.test/a.jpg', finalImageUrl: 'https://store.test/a.jpg' }, w.deps);
  assert.equal(result.outcome, 'reused-original');
  assert.equal(w.puts.length, 0);
  assert.equal(w.row().screenImageUrl, 'https://store.test/a.jpg');
});

test('a failing fetch is an outcome, not an exception, and nothing is written; a submission with no picture is skipped', async () => {
  const w = world(null, true);
  assert.equal((await ensureScreenPicture(w.db, { _id: w.id, imageUrl: 'https://store.test/a.jpg' }, w.deps)).outcome, 'failed');
  assert.equal('screenImageUrl' in w.row(), false);
  assert.equal((await ensureScreenPicture(w.db, { _id: w.id }, w.deps)).outcome, 'no-source');
});

test('a dry run measures and changes nothing', async () => {
  const w = world(await photo(3000, 2000));
  const result = await ensureScreenPicture(w.db, { _id: w.id, imageUrl: 'https://store.test/a.jpg' }, w.deps, { dryRun: true });
  assert.equal(result.outcome, 'made');
  assert.ok(result.screenBytes && result.sourceBytes && result.screenBytes < result.sourceBytes);
  assert.deepEqual([w.puts.length, 'screenImageUrl' in w.row()], [0, false]);
});

test('a picture made again for the same submission, from another source (a photo that was framed later), gets another address, so no cache can show the old one (owner, 2026-10-09)', async () => {
  const unframed = await photo(3000, 2000);
  const framed = await photo(3000, 2000);
  const w1 = world(unframed);
  await ensureScreenPicture(w1.db, { _id: w1.id, imageUrl: 'https://store.test/a.jpg', finalImageUrl: 'https://store.test/a.jpg' }, w1.deps);
  const w2 = world(framed);
  await ensureScreenPicture(w2.db, { _id: w1.id, imageUrl: 'https://store.test/framed.jpg', finalImageUrl: 'https://store.test/framed.jpg' }, w2.deps);
  assert.notEqual(w1.puts[0].pathname, w2.puts[0].pathname, 'another picture, another address');
  // The same picture is the same address, so asking twice stores one file.
  const picture = (await makeScreenPicture(framed)).buffer;
  assert.equal(screenPicturePath('abc', picture), screenPicturePath('abc', Buffer.from(picture)));
  assert.notEqual(screenPicturePath('abc', picture), screenPicturePath('abd', picture));
});
