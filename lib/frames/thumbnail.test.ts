import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameThumbnailUrl } from './thumbnail';

test('a frame is shown by its thumbnail when it has one, else by its own picture', () => {
  assert.equal(frameThumbnailUrl({ thumbnailUrl: 'https://i.example.test/t.png', imageUrl: 'https://i.example.test/full.png' }), 'https://i.example.test/t.png');
  assert.equal(frameThumbnailUrl({ imageUrl: 'https://i.example.test/full.png' }), 'https://i.example.test/full.png', 'library frames have no thumbnail: the picture itself is shown');
  assert.equal(frameThumbnailUrl({ thumbnailUrl: '', imageUrl: ' https://i.example.test/full.png ' }), 'https://i.example.test/full.png');
});

test('only a frame with no picture at all has nothing to show', () => {
  assert.equal(frameThumbnailUrl({}), null);
  assert.equal(frameThumbnailUrl({ thumbnailUrl: null, imageUrl: '   ' }), null);
  assert.equal(frameThumbnailUrl(null), null);
  assert.equal(frameThumbnailUrl(undefined), null);
});
