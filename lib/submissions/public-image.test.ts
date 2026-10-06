import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSubmissionPublicImageUrl } from './public-image';

const FINAL = 'https://store.example/final.jpg';
const IMAGE = 'https://store.example/image.jpg';
const ORIGINAL = 'https://store.example/originals/event-0001/full.jpg';
const RECORD = { version: 1 } as never;

test('the public image is the composite, then the legacy image URL', () => {
  assert.equal(resolveSubmissionPublicImageUrl({ finalImageUrl: FINAL, imageUrl: IMAGE, originalImageUrl: ORIGINAL }), FINAL);
  assert.equal(resolveSubmissionPublicImageUrl({ finalImageUrl: '', imageUrl: IMAGE, originalImageUrl: ORIGINAL }), IMAGE);
});

test('an older submission, where the original is the composite itself, may fall back to it', () => {
  assert.equal(resolveSubmissionPublicImageUrl({ finalImageUrl: '', imageUrl: undefined, originalImageUrl: ORIGINAL }), ORIGINAL);
});

test('a submission with a private full-frame original never exposes it, even when the composite is missing', () => {
  assert.equal(resolveSubmissionPublicImageUrl({ finalImageUrl: '', imageUrl: undefined, originalImageUrl: ORIGINAL, reframe: RECORD }), null);
  assert.equal(resolveSubmissionPublicImageUrl({ finalImageUrl: FINAL, imageUrl: IMAGE, originalImageUrl: ORIGINAL, reframe: RECORD }), FINAL);
});

test('nothing resolves to null', () => {
  assert.equal(resolveSubmissionPublicImageUrl(null), null);
  assert.equal(resolveSubmissionPublicImageUrl(undefined), null);
});
