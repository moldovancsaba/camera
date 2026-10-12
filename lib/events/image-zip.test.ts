import assert from 'node:assert/strict';
import { crc32, inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import type { EventImage } from '@/lib/events/event-export';
import { createImagesZip } from './image-zip';

/**
 * These tests read the finished archive with a small reader of their own (end of central directory record, central directory, local
 * headers; no archive library), so they check the real bytes of the writer in image-zip.ts. The system tools (`unzip -t`, `bsdtar`,
 * Python's zipfile) were checked against the same archives by hand for the pull request that introduced the writer.
 */

interface ZipEntry {
  name: string;
  data: Buffer;
  method: number;
  crcOk: boolean;
  utf8Flag: boolean;
}

function readZip(zip: Buffer): ZipEntry[] {
  // End of central directory: the last 22 bytes when there is no comment.
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'end of central directory record found');
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50, 'central directory signature');
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const crc = zip.readUInt32LE(offset + 16);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const size = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    assert.equal(zip.readUInt32LE(localOffset), 0x04034b50, 'local header signature');
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const stored = zip.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(stored) : Buffer.from(stored);
    assert.equal(data.length, size, `${name}: uncompressed size`);
    entries.push({ name, data, method, crcOk: crc32(data) === crc, utf8Flag: (flags & 0x0800) !== 0 });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

function image(submissionId: string, kind: EventImage['kind'], url: string): EventImage {
  return { submissionId, kind, url, userEmail: '', userName: '', submissionKind: 'original', createdAt: '2026-10-11T10:00:00.000Z' };
}

const PHOTO = randomBytes(300_000); // incompressible, like a JPEG
const SCREEN = Buffer.alloc(200_000, 'giant screen picture '); // very compressible

function fakeHost(files: Record<string, { body: Buffer; type: string | null }>, failing: Record<string, 'throw' | number> = {}) {
  return async (url: string): Promise<Response> => {
    const failure = failing[url];
    if (failure === 'throw') throw new Error('socket hang up');
    if (typeof failure === 'number') return new Response('gone', { status: failure });
    const file = files[url];
    return new Response(Uint8Array.from(file.body), { status: 200, headers: file.type ? { 'content-type': file.type } : {} });
  };
}

test('image zip: every picture is stored under kind/NNNN-id.ext with its exact bytes, in order', async () => {
  const images = [
    image('sub-a', 'original', 'https://i.example/a'),
    image('sub-a', 'final', 'https://i.example/b'),
    image('sub-b', 'primary', 'https://i.example/c.webp?size=big'),
  ];
  const fetchImage = fakeHost({
    'https://i.example/a': { body: PHOTO, type: 'image/jpeg' },
    'https://i.example/b': { body: SCREEN, type: 'image/png; charset=binary' },
    'https://i.example/c.webp?size=big': { body: Buffer.from('tiny'), type: null },
  });

  const entries = readZip(await collect(createImagesZip(images, fetchImage)));

  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['original/0001-sub-a.jpg', 'final/0002-sub-a.png', 'primary/0003-sub-b.webp'],
    'name = kind folder, 4-digit position, submission id, extension from the content type or the address'
  );
  assert.ok(entries[0].data.equals(PHOTO));
  assert.ok(entries[1].data.equals(SCREEN));
  assert.equal(entries[2].data.toString(), 'tiny');
  assert.ok(entries.every((entry) => entry.crcOk), 'every stored checksum matches the bytes');
  assert.ok(entries.every((entry) => entry.method === 0 || entry.method === 8), 'stored or deflated only');
  assert.equal(entries[0].method, 0, 'a picture that does not shrink is stored, not deflated');
  assert.equal(entries[1].method, 8, 'a compressible picture is deflated');
  assert.ok(entries.every((entry) => entry.utf8Flag), 'names are flagged as UTF-8');
});

test('image zip: a picture that cannot be fetched is listed in _errors.txt and does not stop the others', async () => {
  const images = [
    image('ok-1', 'original', 'https://i.example/ok-1.jpg'),
    image('gone', 'original', 'https://i.example/gone.jpg'),
    image('broken', 'final', 'https://i.example/broken.jpg'),
    image('ok-2', 'final', 'https://i.example/ok-2.png'),
  ];
  const fetchImage = fakeHost(
    {
      'https://i.example/ok-1.jpg': { body: PHOTO, type: 'image/jpeg' },
      'https://i.example/ok-2.png': { body: Buffer.from('second'), type: 'image/png' },
    },
    { 'https://i.example/gone.jpg': 404, 'https://i.example/broken.jpg': 'throw' }
  );

  const entries = readZip(await collect(createImagesZip(images, fetchImage)));

  assert.deepEqual(entries.map((entry) => entry.name), ['original/0001-ok-1.jpg', 'final/0004-ok-2.png', '_errors.txt'], 'positions keep counting the failed pictures');
  assert.equal(
    entries[2].data.toString(),
    '2 image(s) could not be fetched:\n\nhttps://i.example/gone.jpg -> HTTP 404\nhttps://i.example/broken.jpg -> socket hang up\n'
  );
  assert.ok(entries.every((entry) => entry.crcOk));
});

test('image zip: when every picture fails the archive holds only _errors.txt', async () => {
  const images = [image('x', 'original', 'https://i.example/x.jpg')];
  const entries = readZip(await collect(createImagesZip(images, fakeHost({}, { 'https://i.example/x.jpg': 500 }))));
  assert.deepEqual(entries.map((entry) => entry.name), ['_errors.txt']);
  assert.match(entries[0].data.toString(), /^1 image\(s\) could not be fetched:\n\nhttps:\/\/i\.example\/x\.jpg -> HTTP 500\n$/);
});

test('image zip: a submission without an id still gets a name, and the same id twice never collides', async () => {
  const images = [image('', 'original', 'https://i.example/1'), image('dup', 'original', 'https://i.example/2'), image('dup', 'original', 'https://i.example/3')];
  const fetchImage = fakeHost({
    'https://i.example/1': { body: Buffer.from('1'), type: 'image/jpeg' },
    'https://i.example/2': { body: Buffer.from('2'), type: 'image/jpeg' },
    'https://i.example/3': { body: Buffer.from('3'), type: 'image/jpeg' },
  });
  const names = readZip(await collect(createImagesZip(images, fetchImage))).map((entry) => entry.name);
  assert.deepEqual(names, ['original/0001-image.jpg', 'original/0002-dup.jpg', 'original/0003-dup.jpg']);
  assert.equal(new Set(names).size, names.length);
});

test('image zip: the checksum function agrees with the published test vector', () => {
  assert.equal(crc32('123456789'), 0xcbf43926);
});

test('image zip: names are written as UTF-8 and an empty picture is a valid entry', async () => {
  const images = [image('árvíztűrő', 'original', 'https://i.example/u.jpg'), image('empty', 'final', 'https://i.example/e.png')];
  const fetchImage = fakeHost({
    'https://i.example/u.jpg': { body: Buffer.from('x'), type: 'image/jpeg' },
    'https://i.example/e.png': { body: Buffer.alloc(0), type: 'image/png' },
  });
  const entries = readZip(await collect(createImagesZip(images, fetchImage)));
  assert.deepEqual(entries.map((entry) => entry.name), ['original/0001-árvíztűrő.jpg', 'final/0002-empty.png']);
  assert.ok(entries.every((entry) => entry.utf8Flag && entry.crcOk));
  assert.equal(entries[1].data.length, 0);
});

test('image zip: a picture that would take the archive past the size limit is left out and named in _errors.txt, and the zip stays valid', async () => {
  const images = [image('fits', 'original', 'https://i.example/fits.jpg'), image('big', 'original', 'https://i.example/big.jpg'), image('small', 'final', 'https://i.example/small.jpg')];
  const fetchImage = fakeHost({
    'https://i.example/fits.jpg': { body: Buffer.from('fits'), type: 'image/jpeg' },
    'https://i.example/big.jpg': { body: randomBytes(3_000_000), type: 'image/jpeg' },
    'https://i.example/small.jpg': { body: Buffer.from('small'), type: 'image/jpeg' },
  });
  // The writer keeps 1 MiB free for _errors.txt, so a limit of 2 MiB lets the two small pictures in and not the 3 MB one.
  const entries = readZip(await collect(createImagesZip(images, fetchImage, { maxBytes: 2 * 1024 * 1024 })));
  assert.deepEqual(entries.map((entry) => entry.name), ['original/0001-fits.jpg', 'final/0003-small.jpg', '_errors.txt']);
  assert.match(entries[2].data.toString(), /big\.jpg -> left out: the archive would pass the 4 GiB/);
  assert.ok(entries.every((entry) => entry.crcOk));
});

test('image zip: a picture is fetched when the client asks for it, not all at once', async () => {
  const urls = ['https://i.example/1.jpg', 'https://i.example/2.jpg', 'https://i.example/3.jpg'];
  const images = urls.map((url, i) => image(`s${i}`, 'original', url));
  const fetched: string[] = [];
  const fetchImage = async (url: string) => {
    fetched.push(url);
    return new Response(Uint8Array.from(Buffer.from(url)), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  const reader = createImagesZip(images, fetchImage).getReader();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(fetched.length <= 1, `before any read at most the first picture is fetched, got ${fetched.length}`);
  await reader.read();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(fetched.length <= 2, `after one read at most two pictures are fetched, got ${fetched.length}`);
  while (!(await reader.read()).done) {
    /* drain */
  }
  assert.deepEqual(fetched, urls);
});
