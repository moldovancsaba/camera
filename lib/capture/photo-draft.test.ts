import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forgetPhotoDraft, recallPhotoDraft, rememberPhotoDraft, type CapturePhotoDraft } from './photo-draft';

const draft: CapturePhotoDraft = {
  eventId: 'event-12345678',
  originalUrl: 'https://blob.public.blob.vercel-storage.com/original.jpg',
  cropUrl: 'https://blob.public.blob.vercel-storage.com/crop.jpg',
  capture: { width: 1280, height: 720, facingMode: 'user', mirrored: true },
  frameId: 'frame-1',
  galleryTick: true,
  croppedWidth: 900,
  croppedHeight: 600,
  savedAt: 1_000,
};

function storage() {
  const data = new Map<string, string>();
  return {
    data,
    setItem: (key: string, value: string) => data.set(key, value),
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => data.delete(key),
  };
}

test('the uploaded photo draft survives a page exit and is limited to its event and short resume window', () => {
  const saved = storage();
  rememberPhotoDraft(saved, draft);
  assert.deepEqual(recallPhotoDraft(saved, draft.eventId, 2_000), draft);
  assert.equal(recallPhotoDraft(saved, 'another-event', 2_000), null);
  assert.equal(recallPhotoDraft(saved, draft.eventId, 1_801_001), null);
});

test('invalid or unavailable browser storage does not break the capture flow', () => {
  const saved = storage();
  saved.setItem('camera.photo-draft.event-12345678', '{bad json');
  assert.equal(recallPhotoDraft(saved, draft.eventId, 2_000), null);
  assert.doesNotThrow(() => rememberPhotoDraft(null, draft));
  assert.doesNotThrow(() => forgetPhotoDraft(null, draft.eventId));
});

test('a completed or restarted capture can remove its browser draft reference', () => {
  const saved = storage();
  rememberPhotoDraft(saved, draft);
  forgetPhotoDraft(saved, draft.eventId);
  assert.equal(recallPhotoDraft(saved, draft.eventId, 2_000), null);
});
