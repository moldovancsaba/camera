import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generatePlaylist } from './playlist';

const sub = (extra: Record<string, unknown>) => ({ _id: 'a'.repeat(24), imageUrl: 'https://store.test/full.jpg', finalImageUrl: 'https://store.test/final.jpg', metadata: { finalWidth: 1600, finalHeight: 900 }, ...extra });

test('a slide carries the screen-sized picture when the photo has one, and the original otherwise', () => {
  assert.equal(generatePlaylist([sub({ screenImageUrl: 'https://store.test/screen.webp' })], 1)[0].submissions[0].imageUrl, 'https://store.test/screen.webp');
  assert.equal(generatePlaylist([sub({})], 1)[0].submissions[0].imageUrl, 'https://store.test/full.jpg');
  assert.equal(generatePlaylist([sub({ screenImageUrl: '' })], 1)[0].submissions[0].imageUrl, 'https://store.test/full.jpg');
  assert.equal(generatePlaylist([sub({ imageUrl: undefined })], 1)[0].submissions[0].imageUrl, 'https://store.test/final.jpg');
});
