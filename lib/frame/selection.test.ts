import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import {
  GENERATED_LAYOUT,
  framesOfMessage,
  layoutOptionsOf,
  messageOptionsOf,
  parseFrameSelection,
  situationOf,
  storedFrameSelection,
  todaysSelection,
} from './selection';
import { loadSelectionContext } from './selection-options';

/** The MTK x Vasas event: two text-free designs, four messages, two on each. */
const MTK_MESSAGES = ['HAJRÁ, MTK!', 'SZÍVEM KÉK-FEHÉR!', 'MTK SZÍV!', 'MINDEN NŐ SZÁMÍT!'];
const MTK_DESIGN = { messages: MTK_MESSAGES, messageFrames: { 'HAJRÁ, MTK!': 'blue', 'SZÍVEM KÉK-FEHÉR!': 'blue', 'MTK SZÍV!': 'pink', 'MINDEN NŐ SZÁMÍT!': 'pink' } };
const CARRIERS = [
  { id: 'blue', name: 'blue' },
  { id: 'pink', name: 'pink' },
];

test('the layouts of the MTK event are its two designs (situation C); a message on both designs counts for both', () => {
  const layouts = layoutOptionsOf({ ownFrames: [], carriers: CARRIERS, design: MTK_DESIGN });
  assert.deepEqual(layouts, CARRIERS);
  assert.equal(situationOf(layouts), 'C');
  const mixed = layoutOptionsOf({ ownFrames: [], carriers: CARRIERS, design: { messages: ['A', 'B'], messageFrames: { A: ['blue', 'pink'] } } });
  assert.deepEqual(mixed.map((layout) => layout.id), ['blue', 'pink', GENERATED_LAYOUT], 'B is on no design, so it is on the generated layout');
});

test('a message that is not written on a design is on the generated layout; with no design at all the generated layout is the only one (situation A)', () => {
  const some = layoutOptionsOf({ ownFrames: [], carriers: CARRIERS, design: { messages: ['A', 'B'], messageFrames: { A: 'blue' } } });
  assert.deepEqual(some.map((layout) => layout.id), ['blue', GENERATED_LAYOUT]);
  const none = layoutOptionsOf({ ownFrames: [], carriers: [], design: null });
  assert.deepEqual(none.map((layout) => layout.id), [GENERATED_LAYOUT]);
  assert.equal(situationOf(none), 'A');
  assert.equal(layoutOptionsOf({ ownFrames: [], carriers: CARRIERS, design: { messages: [] } }).at(-1)?.id, GENERATED_LAYOUT, 'no message: the one image is the generated layout');
});

test('a design that is switched off or gone does not count, and the message on it falls back to the generated layout', () => {
  const layouts = layoutOptionsOf({ ownFrames: [], carriers: [CARRIERS[0]], design: MTK_DESIGN });
  assert.deepEqual(layouts.map((layout) => layout.id), ['blue', GENERATED_LAYOUT]);
});

test('the event’s own complete frames are its layouts and the generated frame is not used (situation B for one, C for more)', () => {
  const own = [{ id: 'f1', name: 'Home' }];
  assert.deepEqual(layoutOptionsOf({ ownFrames: own, carriers: CARRIERS, design: MTK_DESIGN }), own);
  assert.equal(situationOf(own), 'B');
  assert.equal(situationOf([...own, { id: 'f2', name: 'Away' }]), 'C');
});

test('a message is on a design by one id or by a list; empty and duplicate ids are left out', () => {
  assert.deepEqual(framesOfMessage({ A: 'x' }, 'A'), ['x']);
  assert.deepEqual(framesOfMessage({ A: ['x', 'y', 'x', ''] }, 'A'), ['x', 'y']);
  assert.deepEqual(framesOfMessage({ A: 'x' }, 'B'), []);
  assert.deepEqual(framesOfMessage(undefined, 'A'), []);
});

test('the messages users can get are those that can be filled with the names of the event', () => {
  const design = {
    messages: ['Go!', 'Let’s go, {partner1}', 'Beat {partner2}'],
    context: { event: { name: 'Home', homeTeam: { name: 'MTK' } } } as never,
  };
  assert.deepEqual(messageOptionsOf(design), [
    { text: 'Go!', shown: 'Go!' },
    { text: 'Let’s go, {partner1}', shown: 'Let’s go, MTK' },
  ]);
  assert.deepEqual(messageOptionsOf(null), []);
});

test('the setting is checked: a mode of three, and an editor pick must be a layout or message of the event', () => {
  const known = { layouts: ['blue', 'pink'], messages: MTK_MESSAGES };
  assert.deepEqual(parseFrameSelection(undefined, known), { ok: true, value: null });
  assert.deepEqual(parseFrameSelection(null, known), { ok: true, value: null });
  assert.deepEqual(parseFrameSelection({ layout: { mode: 'user' }, message: { mode: 'user' } }, known), {
    ok: true,
    value: { layout: { mode: 'user', pick: null }, message: { mode: 'user', pick: null } },
  });
  assert.deepEqual(parseFrameSelection({ layout: { mode: 'editor', pick: 'pink' }, message: { mode: 'random', pick: 'ignored' } }, known), {
    ok: true,
    value: { layout: { mode: 'editor', pick: 'pink' }, message: { mode: 'random', pick: null } },
  });
  for (const bad of [
    'user',
    [],
    {},
    { layout: { mode: 'user' } },
    { layout: { mode: 'sometimes' }, message: { mode: 'user' } },
    { layout: { mode: 'editor' }, message: { mode: 'user' } },
    { layout: { mode: 'editor', pick: 'green' }, message: { mode: 'user' } },
    { layout: { mode: 'user' }, message: { mode: 'editor', pick: 'not a message' } },
  ]) {
    assert.equal(parseFrameSelection(bad, known).ok, false, JSON.stringify(bad));
  }
});

test('what is stored is read tolerantly, and a broken value is "not set"', () => {
  assert.deepEqual(storedFrameSelection({ layout: { mode: 'editor', pick: 'blue' }, message: { mode: 'user', pick: 'x' } }), {
    layout: { mode: 'editor', pick: 'blue' },
    message: { mode: 'user', pick: null },
  });
  for (const bad of [undefined, null, 'user', { layout: { mode: 'user' } }, { layout: { mode: 'x' }, message: { mode: 'user' } }]) assert.equal(storedFrameSelection(bad), null);
});

test('until an editor saves, an event does what it always did: users choose between several complete frames, everything else is random', () => {
  assert.deepEqual(todaysSelection(0), { layout: { mode: 'random', pick: null }, message: { mode: 'random', pick: null } });
  assert.equal(todaysSelection(1).layout.mode, 'random');
  assert.equal(todaysSelection(2).layout.mode, 'user');
});

const area = { messageBox: { x: 520, y: 8, width: 880, height: 90 } };
const frame = (frameId: string, extra: Record<string, unknown> = {}) => ({ frameId, name: frameId, imageUrl: `https://img.example/${frameId}.png`, isActive: true, ...extra });
const row = (frameId: string, isActive = true) => ({ frameId, isActive, addedAt: 'x', addedBy: 'u' });

test('the options are read from the event and the library: the two MTK designs and four messages are situation C', async () => {
  const { db } = fakeDb({ frames: [frame('blue', { messageArea: area }), frame('pink', { messageArea: area })] });
  const event = { frames: [row('blue'), row('pink')], frameDesign: MTK_DESIGN };
  const context = await loadSelectionContext(db, event);
  assert.deepEqual(context.layouts.map((layout) => layout.id), ['blue', 'pink']);
  assert.equal(context.messages.length, 4);
  assert.equal(context.situation, 'C');
  assert.equal(context.selection, null);
  assert.deepEqual(context.today, todaysSelection(0));
  const saved = await loadSelectionContext(db, { ...event, frameSelection: { layout: { mode: 'user', pick: null }, message: { mode: 'user', pick: null } } });
  assert.equal(saved.selection?.layout.mode, 'user');
});

test('an event with complete frames of its own offers them as layouts, and today users choose between them', async () => {
  const { db } = fakeDb({ frames: [frame('home'), frame('away'), frame('off', { isActive: false }), frame('blue', { messageArea: area })] });
  const event = { frames: [row('home'), row('away'), row('off'), row('blue'), row('home', false)], frameDesign: MTK_DESIGN };
  const context = await loadSelectionContext(db, event);
  assert.deepEqual(context.layouts.map((layout) => layout.id), ['home', 'away']);
  assert.equal(context.messages.length, 0, 'a complete frame carries no message');
  assert.equal(context.today.layout.mode, 'user');
});
