import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCaptureResumeDraft } from './resumable-draft';

const EVENT = '6a6ce7b410a8e78560d63636';
const UUID = 'a34fe8dd-3dd0-4a93-9b4d-cbbca0ee1e0d';
const draft = {
  version: 1,
  eventId: EVENT,
  originalUrl: `https://abc123.public.blob.vercel-storage.com/capture-drafts/${EVENT}/${UUID}.jpg`,
  framedUrl: `https://abc123.public.blob.vercel-storage.com/capture-drafts/${EVENT}/${UUID}-framed.jpg`,
  capture: { width: 1200, height: 1600, facingMode: 'user' as const, mirrored: true },
  selectedFrame: null,
  choice: {},
  galleryTick: false,
};

test('a same-tab SSO draft accepts only this event\'s public temporary photos on the same blob store', () => {
  assert.deepEqual(parseCaptureResumeDraft(JSON.stringify(draft), EVENT), draft);
  assert.equal(parseCaptureResumeDraft(JSON.stringify({ ...draft, eventId: 'another-event' }), EVENT), null);
  assert.equal(parseCaptureResumeDraft(JSON.stringify({ ...draft, originalUrl: 'https://evil.test/photo.jpg' }), EVENT), null);
  assert.equal(parseCaptureResumeDraft(JSON.stringify({ ...draft, framedUrl: draft.framedUrl.replace('abc123', 'other456') }), EVENT), null);
  assert.equal(parseCaptureResumeDraft(JSON.stringify({ ...draft, framedUrl: `${draft.framedUrl}?token=x` }), EVENT), null);
  assert.equal(parseCaptureResumeDraft('not json', EVENT), null);
});
