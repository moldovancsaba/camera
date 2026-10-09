import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsSilhouette, reframeOverlayUrl, type OverlayInput } from './dark-area';

const base: OverlayInput = { vetted: false, hasSelection: false, generated: false, frameUrl: 'https://img.example/frame.png', silhouetteUrl: 'data:silhouette' };

test('an own frame of an event that never set the selection keeps showing the real frame, as it always did', () => {
  assert.equal(reframeOverlayUrl(base), 'https://img.example/frame.png');
  assert.equal(needsSilhouette(base), false);
});

test('under the selection setting a complete frame is its silhouette in the shoot, and the real frame while the silhouette is not there', () => {
  assert.equal(reframeOverlayUrl({ ...base, hasSelection: true }), 'data:silhouette');
  assert.equal(reframeOverlayUrl({ ...base, hasSelection: true, silhouetteUrl: null }), 'https://img.example/frame.png');
  assert.equal(needsSilhouette({ vetted: false, hasSelection: true }), true);
});

test('the frame of a vetted event is never the real one: its silhouette, or nothing while it is drawn', () => {
  assert.equal(reframeOverlayUrl({ ...base, vetted: true }), 'data:silhouette');
  assert.equal(reframeOverlayUrl({ ...base, vetted: true, silhouetteUrl: null }), null);
  assert.equal(reframeOverlayUrl({ ...base, vetted: true, hasSelection: true, silhouetteUrl: null }), null, 'vetted wins over the selection');
  assert.equal(needsSilhouette({ vetted: true, hasSelection: false }), true);
});

test('a generated image or a frame with a message area has territories, not an overlay image', () => {
  for (const vetted of [false, true]) for (const hasSelection of [false, true]) assert.equal(reframeOverlayUrl({ ...base, vetted, hasSelection, generated: true }), null);
  assert.equal(reframeOverlayUrl({ ...base, frameUrl: null }), null, 'no picture');
});
