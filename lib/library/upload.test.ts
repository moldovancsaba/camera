import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { fakeDb } from './fake-db';

const NOW = '2026-11-02T12:00:00.000Z';

function seed() {
  const item = {
    frameId: 'event-frame',
    name: 'Old chooser label',
    imageUrl: 'https://media.example/old.png',
    thumbnailUrl: 'https://media.example/old-thumb.png',
    deleteUrl: 'https://delete.example/old',
    imageId: 'old-id',
    fileSize: 100,
    mimeType: 'image/png',
    scope: 'event',
    eventId: 'event-uuid',
    partnerId: 'partner-uuid',
    isActive: true,
  };
  return { ...fakeDb({ frames: [item] }), item };
}

async function loadUpload(t: TestContext, testCase: string, beforeStore?: () => Promise<void>) {
  t.mock.module('@/lib/imgbb/upload', {
    exports: {
      uploadImage: async (file: File) => {
        await beforeStore?.();
        return {
          success: true,
          imageUrl: 'https://media.example/new.png',
          thumbnailUrl: 'https://media.example/new-thumb.png',
          deleteUrl: 'https://delete.example/new',
          imageId: 'new-id',
          fileSize: file.size,
          mimeType: file.type,
          fileName: file.name,
          provider: 'blob',
          mirrorImageUrl: 'https://media.example/new.png',
        };
      },
    },
  });
  const modulePath = './upload?replace-test=' + testCase;
  return import(modulePath).then((module) => module.replaceLibraryFrameImage);
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'replacement.png', { type: 'image/png' });
const selector = { frameId: 'event-frame', scope: 'event', eventId: 'event-uuid' };

test('replacing a frame keeps its identity and owner while updating the chooser name and image metadata', async (t) => {
  const { db, data, item } = seed();
  const replace = await loadUpload(t, 'normal');
  const result = await replace(db, selector, png(), 'Match day frame', NOW);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.item.frameId, item.frameId);
  assert.equal(result.item.scope, item.scope);
  assert.equal(result.item.eventId, item.eventId);
  assert.equal(result.item.partnerId, item.partnerId);
  assert.equal(result.item.name, 'Match day frame');
  assert.equal(result.item.imageUrl, 'https://media.example/new.png');
  assert.equal(result.item.thumbnailUrl, 'https://media.example/new-thumb.png');
  assert.equal(result.item.updatedAt, NOW);
  assert.equal(data.frames.length, 1, 'replacement edits the same frame rather than creating a second one');
});

test('replacement refuses an invalid image or chooser name before storing media', async (t) => {
  const { db, data } = seed();
  let stores = 0;
  t.mock.module('@/lib/imgbb/upload', { exports: { uploadImage: async () => { stores += 1; throw new Error('must not upload'); } } });
  const modulePath = './upload?case=' + 'invalid-replace-test';
  const { replaceLibraryFrameImage } = await import(modulePath);

  assert.equal((await replaceLibraryFrameImage(db, selector, new File([new Uint8Array([1])], 'bad.gif', { type: 'image/gif' }), 'Bad', NOW)).ok, false);
  assert.equal((await replaceLibraryFrameImage(db, selector, png(), '', NOW)).ok, false);
  assert.equal(stores, 0);
  assert.equal(data.frames[0].imageUrl, 'https://media.example/old.png');
});

test('replacement uses an optimistic source check so a concurrent edit is not overwritten', async (t) => {
  const { db, data } = seed();
  const replace = await loadUpload(t, 'race', async () => {
    await db.collection('frames').updateOne(selector, { $set: { imageUrl: 'https://media.example/concurrent.png' } });
  });
  const result = await replace(db, selector, png(), 'New label', NOW);

  assert.deepEqual(result, { ok: false, status: 409, reason: 'This frame changed while the new image was uploading. Reload it and try again.' });
  assert.equal(data.frames[0].imageUrl, 'https://media.example/concurrent.png');
});
