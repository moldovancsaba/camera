import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectEventImages, eventImageForSubmission, originalImageUrlForExport } from './event-export';

const ORIGINAL = 'https://media.example/original.jpg';
const FRAMED = 'https://media.example/framed.jpg';

test('event image export: unframed submission exports the original and final renditions separately', () => {
  const submission = { frameId: 'none', imageUrl: ORIGINAL, finalImageUrl: ORIGINAL };

  assert.equal(originalImageUrlForExport(submission), ORIGINAL);
  assert.equal(eventImageForSubmission(submission, 'original')?.url, ORIGINAL);
  assert.equal(eventImageForSubmission(submission, 'final')?.url, ORIGINAL);
  assert.equal(collectEventImages([submission], 'final')[0]?.kind, 'final');
});

test('event image export: retained unframed source wins over the framed composition', () => {
  const submission = {
    frameId: 'frame-1',
    imageUrl: FRAMED,
    finalImageUrl: FRAMED,
    originalImageUrl: ORIGINAL,
    reframe: { source: 'capture' },
  };

  assert.equal(originalImageUrlForExport(submission), ORIGINAL);
  assert.equal(eventImageForSubmission(submission, 'final')?.url, FRAMED);
});

test('event image export: missing source for a framed photo never labels the composition as original', () => {
  const submission = { frameId: 'frame-1', imageUrl: FRAMED, finalImageUrl: FRAMED, reframe: { source: 'capture' } };

  assert.equal(originalImageUrlForExport(submission), null);
  assert.equal(eventImageForSubmission(submission, 'original'), null);
  assert.equal(eventImageForSubmission(submission, 'final')?.url, FRAMED);
});
