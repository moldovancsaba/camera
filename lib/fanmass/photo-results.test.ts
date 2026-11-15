import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fanmassAnalysisImageUrl } from './photo-results';

test('Fanmass review displays the unframed image it analyzed, falling back to first-party photos when unframed copy is gone', () => {
  assert.equal(fanmassAnalysisImageUrl({
    photoReview: { photoUrl: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/review-crop.jpg' },
    imageCopies: [{ role: 'unframed', store: 'blob', state: 'verified', url: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/unframed.jpg' }],
    originalImageUrl: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/original.jpg',
    reframe: { mode: 'cover' },
  }), 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/review-crop.jpg');

  assert.equal(fanmassAnalysisImageUrl({
    photoReview: { photoUrl: null },
    imageCopies: [
      { role: 'composed', store: 'blob', state: 'verified', url: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/framed.jpg' },
      { role: 'unframed', store: 'blob', state: 'failed', url: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/failed.jpg' },
      { role: 'unframed', store: 'blob', state: 'verified', url: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/unframed.jpg' },
    ],
  }), 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/unframed.jpg');

  assert.equal(fanmassAnalysisImageUrl({
    originalImageUrl: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/legacy-framed.jpg',
    imageUrl: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/framed.jpg',
    finalImageUrl: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/framed.jpg',
  }), 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/legacy-framed.jpg');

  assert.equal(fanmassAnalysisImageUrl({
    originalImageUrl: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/camera-original.jpg',
    reframe: { mode: 'cover' },
  }), 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/camera-original.jpg');

  assert.equal(fanmassAnalysisImageUrl({}), null);
});

test('ImgBB backup addresses are never returned to the Camera review UI', () => {
  const imgbb = 'https://i.ibb.co/backup/crop.jpg';
  const blobOriginal = 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/original.jpg';

  assert.equal(fanmassAnalysisImageUrl({
    photoReview: { photoUrl: imgbb },
    imageCopies: [
      { role: 'unframed', store: 'imgbb', state: 'verified', url: imgbb },
      { role: 'unframed', store: 'blob', state: 'deleted', url: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/deleted.jpg' },
    ],
    originalImageUrl: blobOriginal,
    reframe: { mode: 'cover' },
  }), blobOriginal, 'use the first-party original when a legacy review/copy field names ImgBB');

  assert.equal(fanmassAnalysisImageUrl({
    photoReview: { photoUrl: imgbb },
    imageCopies: [{ role: 'unframed', store: 'imgbb', state: 'verified', url: imgbb }],
  }), null, 'an ImgBB-only record shows the unavailable state instead of making a browser request to ImgBB');

  assert.equal(fanmassAnalysisImageUrl({
    photoReview: { photoUrl: 'https://outside.example/photo.jpg' },
    imageCopies: [{ role: 'unframed', store: 'blob', state: 'verified', url: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/unframed.jpg' }],
  }), 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/unframed.jpg');
});
