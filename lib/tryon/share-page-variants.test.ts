import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_EVENT_SHARE_PAGE_SETTINGS } from '@/lib/events/share-page-settings';
import { pickFirstCheckedInTryOnVariantCard } from './share-page-variants';

const settings = { ...DEFAULT_EVENT_SHARE_PAGE_SETTINGS, includeCheckedInTryOnResult: true };
const variant = (suit: string | null) => ({ _id: { toString: () => 'v1' }, imageUrl: 'https://store.test/tryon.jpg', tryOnLeatherSuitId: suit });

test('the label of the checked-in try-on picture is English as before, and Hungarian on a Hungarian page', () => {
  assert.equal(pickFirstCheckedInTryOnVariantCard([variant('Rossi 46')], settings)?.label, 'Rossi 46 - checked-in');
  assert.equal(pickFirstCheckedInTryOnVariantCard([variant(null)], settings, 'en')?.label, 'Approved try-on result - checked-in');
  assert.equal(pickFirstCheckedInTryOnVariantCard([variant('Rossi 46')], settings, 'hu')?.label, 'Rossi 46 – próbakép');
});

test('two equal pictures are told apart by the English label in every language, so the page and the download route pick the same one', () => {
  const tied = [
    { ...variant('Bianchi'), _id: { toString: () => 'with-suit' } },
    { ...variant(null), _id: { toString: () => 'without-suit' } },
  ];
  // English: "Approved try-on result - checked-in" sorts before "Bianchi - checked-in"; the Hungarian labels would sort the other way.
  assert.equal(pickFirstCheckedInTryOnVariantCard(tied, settings)?.id, 'without-suit:tryon-checked-in');
  assert.equal(pickFirstCheckedInTryOnVariantCard(tied, settings, 'hu')?.id, 'without-suit:tryon-checked-in');
});
