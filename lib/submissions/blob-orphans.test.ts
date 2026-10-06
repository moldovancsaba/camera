import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blobUrlsIn, findOrphans, type StoredFile } from './blob-orphans';

const HOST = 'abc123.public.blob.vercel-storage.com';
const file = (path: string, ageHours: number, now: Date): StoredFile => ({
  url: `https://${HOST}/${path}`,
  pathname: path,
  size: 100,
  uploadedAt: new Date(now.getTime() - ageHours * 3600_000),
});

test('blobUrlsIn finds this store only, inside JSON, and stops at the closing quote', () => {
  const doc = JSON.stringify({
    imageUrl: `https://${HOST}/submissions/a-1.png`,
    nested: { originalImageUrl: `https://${HOST}/originals/evt/b-2.jpg` },
    other: 'https://other.public.blob.vercel-storage.com/x.png',
    mirror: 'https://i.ibb.co/x/y.jpg',
  });
  assert.deepEqual(blobUrlsIn(doc, HOST), [`https://${HOST}/submissions/a-1.png`, `https://${HOST}/originals/evt/b-2.jpg`]);
});

test('findOrphans reports unreferenced files, and holds back fresh ones as possibly in flight', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const used = file('submissions/used.png', 500, now);
  const old = file('originals/evt/abandoned.jpg', 48, now);
  const fresh = file('originals/evt/just-uploaded.jpg', 1, now);

  const { orphans, inGrace } = findOrphans([used, old, fresh], [used.url], { now, graceMs: 24 * 3600_000 });

  assert.deepEqual(orphans.map((f) => f.pathname), ['originals/evt/abandoned.jpg']);
  assert.deepEqual(inGrace.map((f) => f.pathname), ['originals/evt/just-uploaded.jpg']);
});
