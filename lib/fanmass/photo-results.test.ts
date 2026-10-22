import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fanmassAnalysisImageUrl } from './photo-results';

test('Fanmass review displays the unframed image it analyzed and never falls back to a framed composite', () => {
  assert.equal(fanmassAnalysisImageUrl({
    photoReview: { photoUrl: 'https://private.test/review-crop.jpg' },
    imageCopies: [{ role: 'unframed', state: 'verified', url: 'https://cdn.test/unframed.jpg' }],
    originalImageUrl: 'https://cdn.test/original.jpg',
    reframe: { mode: 'cover' },
  }), 'https://private.test/review-crop.jpg');

  assert.equal(fanmassAnalysisImageUrl({
    photoReview: { photoUrl: null },
    imageCopies: [
      { role: 'composed', state: 'verified', url: 'https://cdn.test/framed.jpg' },
      { role: 'unframed', state: 'failed', url: 'https://cdn.test/failed.jpg' },
      { role: 'unframed', state: 'verified', url: 'https://cdn.test/unframed.jpg' },
    ],
  }), 'https://cdn.test/unframed.jpg');

  assert.equal(fanmassAnalysisImageUrl({
    originalImageUrl: 'https://cdn.test/legacy-framed.jpg',
    imageUrl: 'https://cdn.test/framed.jpg',
    finalImageUrl: 'https://cdn.test/framed.jpg',
  }), null);

  assert.equal(fanmassAnalysisImageUrl({
    originalImageUrl: 'https://cdn.test/camera-original.jpg',
    reframe: { mode: 'cover' },
  }), 'https://cdn.test/camera-original.jpg');
});
