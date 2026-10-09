import assert from 'node:assert/strict';
import { test } from 'node:test';
import { designFromDraft, draftFromDesign, emptyDraft, placeUnderWindow } from './ScreenDesignFields';
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

// A new text is one line under the photo window, as wide as the window and scaled to fill it (owner, 2026-10-09).
const WINDOW = { left: '2.075', top: '3.081', width: '69.274', height: '69.273' };

test('a text typed into an empty row goes under the window, as wide as the window, and fills its box', () => {
  const placed = placeUnderWindow({ ...emptyDraft().texts[0], text: 'go.messmass.com/mtk-vasas' }, WINDOW);
  assert.equal(placed.x, '2.075');
  assert.equal(placed.width, '69.274', 'the box is as wide as the window');
  assert.equal(placed.y, '80.9', 'under the window (3.081 + 69.273 + 8.5)');
  assert.equal(placed.size, '10');
  assert.equal(placed.fit, true);
  const design = designFromDraft({ ...draft(R2_OVERLAY), ...WINDOW, texts: [placed] });
  assert.equal(design?.texts?.[0].fit, true);
  assert.ok(parseScreenDesign(design).ok, 'the design passes the check as it stands');
});

test('a row that already has a place, or a window that is not filled in yet, is left alone', () => {
  const placed = { ...emptyDraft().texts[0], text: 'Hello', x: '10', y: '10', width: '30', size: '5' };
  assert.deepEqual(placeUnderWindow(placed, WINDOW), placed);
  const row = { ...emptyDraft().texts[0], text: 'Hello' };
  assert.deepEqual(placeUnderWindow(row, { ...WINDOW, width: '' }), row);
});

test('a text keeps its own fit setting through the editor: a fixed size stays fixed', () => {
  const design = { overlayImageUrl: R2_OVERLAY, window: { left: 2, top: 3, width: 69, height: 69 }, photoFit: 'cover' as const, texts: [
    { text: 'Fixed', x: 1, y: 80, width: 60, size: 7, align: 'center' as const },
    { text: 'Filled', x: 1, y: 90, width: 60, size: 9, align: 'center' as const, fit: true },
  ] };
  assert.deepEqual(designFromDraft(draftFromDesign(design)), design);
});
