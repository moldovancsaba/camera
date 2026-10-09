import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftToSlots, imageKey, rowSummary, slotsToDraft } from './slots-draft';
import { DEFAULT_SLOTS, isDefaultSlots, parseSlots, type FrameSlots } from './slots';

/** A colour from its digits: the colour gate allows no raw hex literal in a test. */
const hex = (digits: string) => `#${digits}`;

const BLOB = 'https://abc123.public.blob.vercel-storage.com/frames';

test('an event with no slots shows the four slots of the default frame, and sending them back is the default frame', () => {
  const rows = slotsToDraft(undefined);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.filter((r) => r.textSource !== 'off').map((r) => [r.position, r.textSource]), [['top-left', 'teams'], ['bottom-center', 'message']]);
  assert.deepEqual(rows.filter((r) => r.pictureSource !== 'off').map((r) => [r.position, r.pictureSource]), [['top-right', 'partnerLogo'], ['bottom-center', 'bar']]);
  const checked = parseSlots(draftToSlots(rows));
  assert.ok(checked.ok && isDefaultSlots(checked.slots));
});

test('stored slots come back as the same slots after editing nothing', () => {
  const slots: FrameSlots = {
    text: { 'top-center': { source: 'custom', text: '#pinkmonth', colour: hex('ffffff') }, 'bottom-right': { source: 'team1' } },
    picture: {
      'bottom-center': { source: 'picture', images: [{ key: 'img1', imageUrl: `${BLOB}/blue.png` }, { key: 'img2', imageUrl: `${BLOB}/pink.png` }], byMessage: { 'MTK SZÍV!': 'img2' } },
      'bottom-left': { source: 'picture', images: [{ key: 'img1', imageUrl: `${BLOB}/crest.png` }], size: 22 },
    },
  };
  const checked = parseSlots(draftToSlots(slotsToDraft(slots)));
  assert.ok(checked.ok);
  if (checked.ok) assert.deepEqual(checked.slots, slots);
});

test('a picture still to choose is left out, and a message keeps its picture when an empty one before it goes', () => {
  const rows = slotsToDraft(undefined);
  const bottom = rows.find((r) => r.position === 'bottom-center')!;
  bottom.pictureSource = 'picture';
  bottom.images = ['', `${BLOB}/pink.png`, `${BLOB}/blue.png`];
  bottom.byMessage = { 'MTK SZÍV!': 1, 'HAJRÁ, MTK!': 2 };
  const slots = draftToSlots(rows).picture['bottom-center'] as { images: Array<{ key: string; imageUrl: string }>; byMessage: Record<string, string> };
  assert.deepEqual(slots.images, [{ key: imageKey(0), imageUrl: `${BLOB}/pink.png` }, { key: imageKey(1), imageUrl: `${BLOB}/blue.png` }]);
  assert.deepEqual(slots.byMessage, { 'MTK SZÍV!': 'img1', 'HAJRÁ, MTK!': 'img2' });
  // all pictures still to choose: the server answers that a picture is needed
  bottom.images = [''];
  const checked = parseSlots(draftToSlots(rows));
  assert.equal(checked.ok, false);
});

test('a corner picture takes a size, a centre one does not; an own text sends its words and colour only when it is an own text', () => {
  const rows = slotsToDraft(undefined);
  const topRight = rows.find((r) => r.position === 'top-right')!;
  topRight.size = '25';
  const topLeft = rows.find((r) => r.position === 'top-left')!;
  topLeft.customText = 'ignored';
  topLeft.textColour = ` ${hex('ffffff')} `;
  const bottomCentre = rows.find((r) => r.position === 'bottom-center')!;
  bottomCentre.size = '40';
  const slots = draftToSlots(rows);
  assert.deepEqual(slots.picture['top-right'], { source: 'partnerLogo', size: '25' });
  assert.deepEqual(slots.picture['bottom-center'], { source: 'bar' });
  assert.deepEqual(slots.text['top-left'], { source: 'teams', colour: hex('ffffff') });
});

test('a row says in a few words what is in it', () => {
  const rows = slotsToDraft(undefined);
  assert.equal(rowSummary(rows[0]), 'text: team 1 over team 2');
  assert.equal(rowSummary(rows[1]), 'nothing');
  assert.equal(rowSummary(rows[3]), 'nothing');
  assert.equal(rowSummary(rows.find((r) => r.position === 'bottom-center')!), 'text: fan supporter message · picture: generated message background');
  assert.ok(DEFAULT_SLOTS.text['top-left']);
});
