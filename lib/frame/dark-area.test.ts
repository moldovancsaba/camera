import assert from 'node:assert/strict';
import { test } from 'node:test';
import { darkAreaUrl, type OverlayInput } from './dark-area';

const base: OverlayInput = { vetted: false, generated: false, frameUrl: 'https://img.example/frame.png', silhouetteUrl: 'data:silhouette' };

test('a complete frame of the event’s own is its silhouette, on every event: one general method', () => {
  assert.equal(darkAreaUrl(base), 'data:silhouette');
});

test('where the silhouette cannot be made an event that is not vetted falls back to the real frame, as before the silhouette existed', () => {
  assert.equal(darkAreaUrl({ ...base, silhouetteUrl: null }), 'https://img.example/frame.png');
});

test('the frame of a vetted event is never the real one: its silhouette, or nothing while it is drawn or when it cannot be made', () => {
  assert.equal(darkAreaUrl({ ...base, vetted: true }), 'data:silhouette');
  assert.equal(darkAreaUrl({ ...base, vetted: true, silhouetteUrl: null }), null);
});

test('a generated image or a frame with a message area has territories, not an overlay image', () => {
  for (const vetted of [false, true]) assert.equal(darkAreaUrl({ ...base, vetted, generated: true }), null);
  assert.equal(darkAreaUrl({ ...base, frameUrl: null }), null, 'no picture');
});
