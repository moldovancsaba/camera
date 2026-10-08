import assert from 'node:assert/strict';
import { test } from 'node:test';
import { designFromDraft, emptyDraft } from './ScreenDesignFields';
import { parseScreenDesign } from '@/lib/slideshow/screen-design';
import { chosenValue } from '@/lib/library/picker';

// The overlay is chosen with the picture picker (camera#368); the design keeps the same plain address and the API checks it as before.
const LIBRARY_PICTURE = { imageUrl: 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/image-1760000000000-overlay.png' };
const R2_OVERLAY = 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/landing/mtk-vasas/overlay.png';
const draft = (overlayImageUrl: string) => ({ ...emptyDraft(), overlayImageUrl, left: '2', top: '3', width: '69', height: '69' });

test('the overlay chosen from the library is stored as the same plain address, and the design passes the check', () => {
  const design = designFromDraft(draft(chosenValue(LIBRARY_PICTURE)));
  assert.equal(design?.overlayImageUrl, LIBRARY_PICTURE.imageUrl);
  const parsed = parseScreenDesign(design);
  assert.equal(parsed.ok && parsed.value?.overlayImageUrl, LIBRARY_PICTURE.imageUrl);
});

test('an overlay address in no library keeps working, an empty one removes the design, and the https check stays', () => {
  assert.equal(designFromDraft(draft(R2_OVERLAY))?.overlayImageUrl, R2_OVERLAY);
  assert.equal(designFromDraft(draft('  ')), null, 'Clear in the picker: no picture, a plain slideshow');
  for (const bad of ['http://i.ibb.co/x/overlay.png', 'overlay.png', 'https://user:secret@example.test/overlay.png']) {
    assert.equal(parseScreenDesign(designFromDraft(draft(bad))).ok, false, bad);
  }
});
