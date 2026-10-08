import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import sharp from 'sharp';

type UploadModule = typeof import('./upload');

// The mirror is imgbb; `mirror` decides how it behaves. Vercel Blob is always quick; what it was given is kept in `puts`.
const puts: Array<{ name: string; body: Buffer; contentType: string }> = [];
async function load(t: TestContext, tag: string, mirror: 'hangs' | 'works'): Promise<UploadModule> {
  process.env.IMGBB_API_KEY = 'test-key-not-real';
  t.after(() => { delete process.env.IMGBB_API_KEY; });
  puts.length = 0;
  t.mock.module('@vercel/blob', {
    namedExports: {
      put: async (name: string, body: Buffer, options: { contentType: string }) => {
        puts.push({ name, body, contentType: options.contentType });
        return { url: 'https://blob.example.test/photo.png' };
      },
    },
  });
  const post = mirror === 'hangs'
    ? () => new Promise(() => undefined)
    : async () => ({ data: { success: true, data: { id: 'abc', url: 'https://i.ibb.co/abc/photo.png', display_url: 'https://i.ibb.co/abc/photo.png', delete_url: 'https://ibb.co/abc/del' } } });
  const axios = { post, get: async () => ({ data: { destroy: () => undefined } }), isAxiosError: () => false };
  t.mock.module('axios', { defaultExport: axios, namedExports: { AxiosError: class extends Error {} } });
  return (await import('./upload?case=' + tag)) as UploadModule;
}

const png = async () => (await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer()).toString('base64');

test('a mirror that does not answer is left behind: the upload still returns the Blob picture, soon', async (t) => {
  const { uploadImage } = await load(t, 'hangs', 'hangs');
  const started = Date.now();
  const result = await uploadImage(await png(), { name: 'x', mirrorWaitMs: 50 });
  assert.equal(result.imageUrl, 'https://blob.example.test/photo.png');
  assert.equal(result.mirrorImageUrl, null);
  assert.equal(result.imageId, '');
  assert.ok(Date.now() - started < 2000, 'the call did not wait for the mirror');
});

test('a mirror that answers in time is still kept', async (t) => {
  const { uploadImage } = await load(t, 'works', 'works');
  const result = await uploadImage(await png(), { name: 'x', mirrorWaitMs: 2000, validatePublicUrl: false });
  assert.equal(result.imageUrl, 'https://blob.example.test/photo.png');
  assert.equal(result.mirrorImageUrl, 'https://i.ibb.co/abc/photo.png');
  assert.equal(result.imageId, 'abc');
  assert.equal(result.deleteUrl, 'https://ibb.co/abc/del');
});

test('a File is read on the server, where there is no FileReader: the library uploads pass the file itself', async (t) => {
  const { uploadImage } = await load(t, 'file', 'hangs');
  const bytes = Buffer.from(await png(), 'base64');
  const result = await uploadImage(new File([bytes], 'pitch.png', { type: 'image/png' }), { name: 'image-1', mirrorWaitMs: 50 });
  assert.equal(result.imageUrl, 'https://blob.example.test/photo.png');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.fileSize, bytes.byteLength);
  assert.deepEqual(puts.map((p) => [p.name, p.contentType]), [['image-1.png', 'image/png']]);
  assert.ok(puts[0].body.equals(bytes), 'the stored bytes are the bytes of the file');
});

test('an SVG is stored as image/svg+xml, the type a browser needs to draw it', async (t) => {
  const { uploadImage } = await load(t, 'svg', 'hangs');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>';
  const result = await uploadImage(new File([svg], 'crest.svg', { type: 'image/svg+xml' }), { name: 'image-2', mirrorWaitMs: 50 });
  assert.equal(result.mimeType, 'image/svg+xml');
  assert.deepEqual(puts.map((p) => [p.name, p.contentType]), [['image-2.svg', 'image/svg+xml']]);
});
