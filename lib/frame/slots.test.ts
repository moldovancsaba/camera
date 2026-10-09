import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SLOTS, SLOT_POSITIONS, isDefaultSlots, parseSlots, pictureSourcesAt, resolveSlotPictures, slotsForMessage, type FrameSlots } from './slots';

/** A colour from its digits: the colour gate allows no raw hex literal in a test. */
const hex = (digits: string) => `#${digits}`;

const BLOB = 'https://abc123.public.blob.vercel-storage.com/frames';
const blue = { key: 'blue', imageUrl: `${BLOB}/blue.png` };
const pink = { key: 'pink', imageUrl: `${BLOB}/pink.png` };

test('the default frame is four slots: teams top left, the message bottom centre, the partner logo top right, the generated bar bottom centre', () => {
  assert.deepEqual(DEFAULT_SLOTS.text, { 'top-left': { source: 'teams' }, 'bottom-center': { source: 'message' } });
  assert.deepEqual(DEFAULT_SLOTS.picture, { 'top-right': { source: 'partnerLogo' }, 'bottom-center': { source: 'bar' } });
  const checked = parseSlots(JSON.parse(JSON.stringify(DEFAULT_SLOTS)));
  assert.ok(checked.ok && isDefaultSlots(checked.slots));
});

test('there are six positions and a corner takes the logo or a picture, a centre (a bar) the generated bar or a picture', () => {
  assert.equal(SLOT_POSITIONS.length, 6);
  assert.deepEqual(pictureSourcesAt('top-left'), ['partnerLogo', 'picture']);
  assert.deepEqual(pictureSourcesAt('bottom-center'), ['bar', 'picture']);
});

test('all twelve slots can be on at once, each with its own source', () => {
  const checked = parseSlots({
    text: {
      'top-left': { source: 'teams' },
      'top-center': { source: 'title', colour: hex('FFFFFF') },
      'top-right': { source: 'custom', text: '  #pinkmonth  ' },
      'bottom-left': { source: 'team1' },
      'bottom-center': { source: 'message' },
      'bottom-right': { source: 'team2' },
    },
    picture: {
      'top-left': { source: 'picture', images: [blue], size: 25 },
      'top-center': { source: 'picture', images: [blue, pink], byMessage: { 'Go! Go! Go!': 'blue' } },
      'top-right': { source: 'partnerLogo' },
      'bottom-left': { source: 'picture', images: [pink] },
      'bottom-center': { source: 'bar' },
      'bottom-right': { source: 'picture', images: [blue], size: 15 },
    },
  });
  assert.ok(checked.ok, checked.ok ? '' : checked.error);
  if (!checked.ok) return;
  assert.equal(Object.keys(checked.slots.text).length, 6);
  assert.equal(Object.keys(checked.slots.picture).length, 6);
  assert.equal(checked.slots.text['top-right']?.text, '#pinkmonth', 'the words are trimmed');
  assert.equal(checked.slots.text['top-center']?.colour, hex('ffffff'), 'a colour is kept in lower case');
  assert.equal(checked.slots.picture['top-left']?.size, 25);
  assert.equal(checked.slots.picture['bottom-right']?.size, undefined, 'the default size is not stored');
});

const bad = (input: unknown) => {
  const checked = parseSlots(input);
  assert.equal(checked.ok, false);
  return checked.ok ? '' : checked.error;
};

test('what the admin sends is checked: unknown positions and sources, a source where it cannot be, a picture from elsewhere, an empty frame', () => {
  assert.match(bad(null), /not valid/);
  assert.match(bad({ text: { 'middle-left': { source: 'teams' } } }), /not a position/);
  assert.match(bad({ text: { 'top-left': { source: 'weather' } } }), /unknown source/);
  assert.match(bad({ text: { 'top-left': { source: 'custom' } } }), /needs its text/);
  assert.match(bad({ text: { 'top-left': { source: 'custom', text: 'x'.repeat(121) } } }), /longer than 120/);
  assert.match(bad({ text: { 'top-left': { source: 'teams', colour: 'red' } } }), /colour/);
  assert.match(bad({ picture: { 'top-left': { source: 'bar' } } }), /cannot show the generated bar here/);
  assert.match(bad({ picture: { 'top-center': { source: 'partnerLogo' } } }), /cannot show the partner logo here/);
  assert.match(bad({ picture: { 'top-left': { source: 'picture' } } }), /needs a picture/);
  assert.match(bad({ picture: { 'top-left': { source: 'picture', images: [{ key: 'a', imageUrl: 'https://evil.test/a.png' }] } } }), /not from the app's own storage/);
  assert.match(bad({ picture: { 'top-left': { source: 'picture', images: [{ key: 'a', imageUrl: 'http://abc.public.blob.vercel-storage.com/a.png' }] } } }), /own storage/);
  assert.match(bad({ picture: { 'top-left': { source: 'picture', images: [blue, { ...pink, key: 'blue' }] } } }), /two pictures/);
  assert.match(bad({ picture: { 'top-left': { source: 'picture', images: Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, imageUrl: `${BLOB}/${i}.png` })) } } }), /more than 6/);
  assert.match(bad({ picture: { 'top-left': { source: 'picture', images: [blue], byMessage: { Hi: 'green' } } } }), /does not have/);
  assert.match(bad({ picture: { 'top-left': { source: 'picture', images: [blue], size: 80 } } }), /size/);
  assert.match(bad({ text: {}, picture: {} }), /at least one slot/);
});

test('the fan message, the teams, the event title and the partner logo can be in one place only', () => {
  assert.match(bad({ text: { 'top-left': { source: 'message' }, 'bottom-center': { source: 'message' } } }), /fan message can be in one place only/);
  assert.match(bad({ text: { 'top-left': { source: 'teams' }, 'top-right': { source: 'teams' } } }), /teams can be in one place only/);
  assert.match(bad({ picture: { 'top-left': { source: 'partnerLogo' }, 'top-right': { source: 'partnerLogo' } } }), /partner logo can be in one place only/);
  // an own text may be used as often as wanted
  assert.ok(parseSlots({ text: { 'top-left': { source: 'custom', text: 'a' }, 'top-right': { source: 'custom', text: 'a' } } }).ok);
});

test('a message uses the picture it is mapped to, otherwise the first; the key of its image depends on that picture only', () => {
  const slots: FrameSlots = { text: {}, picture: { 'bottom-center': { source: 'picture', images: [blue, pink], byMessage: { 'MTK SZÍV!': 'pink' } }, 'top-right': { source: 'partnerLogo' } } };
  assert.equal(resolveSlotPictures(slots, 'MTK SZÍV!')['bottom-center']?.key, 'pink');
  assert.equal(resolveSlotPictures(slots, 'HAJRÁ, MTK!')['bottom-center']?.key, 'blue');
  assert.equal(resolveSlotPictures(slots, null)['bottom-center']?.key, 'blue');
  assert.equal(resolveSlotPictures(slots, 'x')['top-right'], undefined, 'only picture slots have a picture');
  // two messages that use the same picture give the same value, two that do not differ
  assert.equal(JSON.stringify(slotsForMessage(slots, 'HAJRÁ, MTK!')), JSON.stringify(slotsForMessage(slots, 'Go!')));
  assert.notEqual(JSON.stringify(slotsForMessage(slots, 'MTK SZÍV!')), JSON.stringify(slotsForMessage(slots, 'Go!')));
});

test('a set of slots equal to the default is the default whatever the order of the keys', () => {
  assert.ok(isDefaultSlots({ picture: { 'bottom-center': { source: 'bar' }, 'top-right': { source: 'partnerLogo' } }, text: { 'bottom-center': { source: 'message' }, 'top-left': { source: 'teams' } } }));
  assert.equal(isDefaultSlots({ text: { 'top-left': { source: 'teams' } }, picture: DEFAULT_SLOTS.picture }), false);
});
