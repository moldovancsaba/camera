import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMissingImagePlaceholder } from './placeholder';

test('the ImgBB "image not found" stand-in is recognised by host and size', () => {
  assert.equal(isMissingImagePlaceholder('https://i.ibb.co/NndTR67D/submission-1762285138086.png', 180, 180), true);
  assert.equal(isMissingImagePlaceholder('https://ibb.co/abc', 180, 180), true);
});

test('a real picture, a different size, another host or no address is never taken for it', () => {
  assert.equal(isMissingImagePlaceholder('https://i.ibb.co/x/photo.jpg', 1920, 1080), false);
  assert.equal(isMissingImagePlaceholder('https://i.ibb.co/x/photo.jpg', 180, 181), false);
  assert.equal(isMissingImagePlaceholder('https://abc.public.blob.vercel-storage.com/a.png', 180, 180), false, 'a small picture of our own is a picture');
  assert.equal(isMissingImagePlaceholder('https://notibb.co.evil.test/a.png', 180, 180), false);
  assert.equal(isMissingImagePlaceholder('not an address', 180, 180), false);
  assert.equal(isMissingImagePlaceholder('data:image/png;base64,AAAA', 180, 180), false);
});
