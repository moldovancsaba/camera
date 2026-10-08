import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cascadeText } from './cascade-text';

test('the sentence names the count for the kind that changed, and is empty when no event changed', () => {
  assert.equal(cascadeText(null, 'logos'), null);
  assert.equal(cascadeText({ framesUpdated: 0, logosUpdated: 0 }, 'frames'), null);
  assert.equal(cascadeText({ framesUpdated: 4, logosUpdated: 0 }, 'logos'), null, 'only the kind that was edited counts');
  assert.match(cascadeText({ logosUpdated: 1 }, 'logos') ?? '', /changed on 1 event that follows the defaults/);
  assert.match(cascadeText({ framesUpdated: 12 }, 'frames') ?? '', /changed on 12 events that follow the defaults/);
});
