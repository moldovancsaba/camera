import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CaptureFrame, CaptureSelection, CaptureVariant } from './capture';
import { NO_CHOICE, chooseLayout, drawOwnFrame, drawVariant, fitting, layoutIdOf, layoutsToChoose, messagesToChoose, nextStep, variantKeyOf, type Choice } from './choose';

/** The MTK x Vasas event: blue carries messages 0 and 1, pink carries 2 and 3; message 0 is also on pink (a message on several designs). */
const MESSAGES = ['HAJRÁ, MTK!', 'SZÍVEM KÉK-FEHÉR!', 'MTK SZÍV!', 'MINDEN NŐ SZÁMÍT!'];
const image = (index: number, frameId: string | null): CaptureVariant => ({ index, message: MESSAGES[index], imageUrl: `https://img.example/${frameId}-${index}.png`, width: 1920, height: 1080, layers: [], frameId });
const VARIANTS = [image(0, 'blue'), image(0, 'pink'), image(1, 'blue'), image(2, 'pink'), image(3, 'pink')];

const frame = (selection: CaptureSelection | null, variants = VARIANTS): CaptureFrame => ({ width: 1920, height: 1080, variants, selection });
const sel = (layout: CaptureSelection['layout'], message: CaptureSelection['message']): CaptureSelection => ({ layout, message });
const USER = { mode: 'user' as const, pick: null };
const RANDOM = { mode: 'random' as const, pick: null };
const ids = (variants: CaptureVariant[]) => variants.map((v) => `${layoutIdOf(v)}:${v.index}`);

test('without a setting nothing here applies: the page keeps its random image at every shutter press', () => {
  const plain = frame(null);
  assert.equal(nextStep(plain, NO_CHOICE), 'capture-photo');
  assert.deepEqual(layoutsToChoose(plain), []);
  assert.deepEqual(messagesToChoose(plain, NO_CHOICE), []);
  assert.equal(fitting(plain, NO_CHOICE).length, 5);
});

test('the user chooses both: the design first, then the message, then the photo', () => {
  const both = frame(sel(USER, USER));
  assert.equal(nextStep(both, NO_CHOICE), 'select-layout');
  assert.deepEqual(layoutsToChoose(both).map(layoutIdOf), ['blue', 'pink']);

  let choice: Choice = chooseLayout(both, NO_CHOICE, 'blue');
  assert.equal(nextStep(both, choice), 'select-message');
  assert.deepEqual(messagesToChoose(both, choice).map((v) => v.index), [0, 1], 'only the messages the design offers');

  choice = { ...choice, messageIndex: 1 };
  assert.equal(nextStep(both, choice), 'capture-photo');
  assert.deepEqual(ids(fitting(both, choice)), ['blue:1']);
  assert.equal(drawVariant(both, choice, null)?.imageUrl, 'https://img.example/blue-1.png');
  assert.equal(drawVariant(both, choice, 'blue|1')?.imageUrl, 'https://img.example/blue-1.png', 'one image fits, so it repeats because it has to');
});

test('a change of design keeps the message if the new design offers it, and asks again if not', () => {
  const both = frame(sel(USER, USER));
  const onBlue: Choice = { layoutId: 'blue', messageIndex: 0 };
  const stays = chooseLayout(both, onBlue, 'pink');
  assert.deepEqual(stays, { layoutId: 'pink', messageIndex: 0 }, 'message 0 is on pink too');
  assert.equal(nextStep(both, stays), 'capture-photo');

  const dropped = chooseLayout(both, { layoutId: 'blue', messageIndex: 1 }, 'pink');
  assert.deepEqual(dropped, { layoutId: 'pink', messageIndex: null }, 'message 1 is not on pink');
  assert.equal(nextStep(both, dropped), 'select-message');
  assert.deepEqual(messagesToChoose(both, dropped).map((v) => v.index), [0, 2, 3]);
});

test('when the user changes the design, every design is offered, whatever message was chosen', () => {
  const both = frame(sel(USER, USER));
  assert.deepEqual(layoutsToChoose(both).map(layoutIdOf), ['blue', 'pink']);
});

test('the editor picks the design: the user is never asked for it, and only messages of that design are offered', () => {
  const picked = frame(sel({ mode: 'editor', pick: 'pink' }, USER));
  assert.equal(nextStep(picked, NO_CHOICE), 'select-message');
  assert.deepEqual(messagesToChoose(picked, NO_CHOICE).map((v) => v.index), [0, 2, 3]);
  assert.deepEqual(layoutsToChoose(picked), []);
  assert.ok(fitting(picked, { layoutId: null, messageIndex: 2 }).every((v) => v.frameId === 'pink'));
});

test('the editor picks the message and the user the design: only designs that carry it are offered', () => {
  const picked = frame(sel(USER, { mode: 'editor', pick: 1 }));
  assert.deepEqual(layoutsToChoose(picked).map(layoutIdOf), [], 'message 1 is on blue only: one design is no choice');
  const wide = frame(sel(USER, { mode: 'editor', pick: 0 }));
  assert.deepEqual(layoutsToChoose(wide).map(layoutIdOf), ['blue', 'pink']);
  assert.deepEqual(ids(fitting(picked, NO_CHOICE)), ['blue:1']);
});

test('the user chooses the design and the message is random: a new message on that design at every photo, never the same twice in a row', () => {
  const layout = frame(sel(USER, RANDOM));
  const choice: Choice = { layoutId: 'pink', messageIndex: null };
  assert.equal(nextStep(layout, NO_CHOICE), 'select-layout');
  assert.equal(nextStep(layout, choice), 'capture-photo');
  const seen = new Set<string>();
  let previous: string | null = null;
  for (const random of [0, 0.34, 0.67, 0.99, 0.5, 0.1]) {
    const drawn: CaptureVariant = drawVariant(layout, choice, previous, () => random)!;
    assert.equal(drawn.frameId, 'pink');
    assert.notEqual(variantKeyOf(drawn), previous);
    seen.add(variantKeyOf(drawn));
    previous = variantKeyOf(drawn);
  }
  assert.ok(seen.size > 1, 'every photo draws again');
});

test('the design is random and the user chooses the message: every message is offered, and the design is drawn among those that carry it', () => {
  const message = frame(sel(RANDOM, USER));
  assert.equal(nextStep(message, NO_CHOICE), 'select-message');
  assert.deepEqual(messagesToChoose(message, NO_CHOICE).map((v) => v.index), [0, 1, 2, 3]);
  const choice: Choice = { layoutId: null, messageIndex: 0 };
  assert.equal(nextStep(message, choice), 'capture-photo');
  assert.deepEqual(new Set([0, 0.99].map((r) => layoutIdOf(drawVariant(message, choice, null, () => r)!))), new Set(['blue', 'pink']));
  const second = drawVariant(message, choice, 'blue|0', () => 0)!;
  assert.equal(layoutIdOf(second), 'pink', 'not the same design twice in a row while another carries the message');
});

test('both random: any image, never the one of the photo before', () => {
  const random = frame(sel(RANDOM, RANDOM));
  assert.equal(nextStep(random, NO_CHOICE), 'capture-photo');
  for (const previous of VARIANTS.map(variantKeyOf)) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) assert.notEqual(variantKeyOf(drawVariant(random, NO_CHOICE, previous, () => r)!), previous);
  }
});

test('the editor picks both: that one image', () => {
  const picked = frame(sel({ mode: 'editor', pick: 'pink' }, { mode: 'editor', pick: 3 }));
  assert.equal(nextStep(picked, NO_CHOICE), 'capture-photo');
  assert.deepEqual(ids(fitting(picked, NO_CHOICE)), ['pink:3']);
});

test('a pick that cannot be met gives way: the message first, then the design, so a photo always has an image', () => {
  const notThere = frame(sel({ mode: 'editor', pick: 'blue' }, { mode: 'editor', pick: 3 }));
  assert.deepEqual(ids(fitting(notThere, NO_CHOICE)), ['blue:0', 'blue:1'], 'message 3 is not on blue: the design is kept');
  const gone = frame(sel({ mode: 'editor', pick: 'green' }, { mode: 'editor', pick: 2 }));
  assert.deepEqual(ids(fitting(gone, NO_CHOICE)), ['pink:2'], 'no design green: the message is kept');
  const none = frame(sel({ mode: 'editor', pick: 'green' }, { mode: 'editor', pick: 9 }));
  assert.equal(fitting(none, NO_CHOICE).length, 5);
  assert.equal(drawVariant(frame(sel(RANDOM, RANDOM), []), NO_CHOICE, null), null, 'no image at all');
});

test('one design or one message is no choice, and an image without a message is not offered as a message', () => {
  const one = frame(sel(USER, USER), [image(0, 'blue'), image(1, 'blue')]);
  assert.deepEqual(layoutsToChoose(one), [], 'one design');
  assert.equal(nextStep(one, NO_CHOICE), 'select-message');
  const single = frame(sel(USER, USER), [image(0, 'blue')]);
  assert.equal(nextStep(single, NO_CHOICE), 'capture-photo');
  const bare = frame(sel(USER, USER), [{ ...image(0, null), index: null, message: null }, image(0, null)]);
  assert.deepEqual(messagesToChoose(bare, NO_CHOICE), []);
});

test('the generated layout is a design among the others, written on no frame', () => {
  const mixed = frame(sel(USER, RANDOM), [image(0, 'blue'), image(1, null)]);
  assert.deepEqual(layoutsToChoose(mixed).map(layoutIdOf), ['blue', 'generated']);
});

test('the frames of the event’s own: the editor’s pick, a random one that is never the last, or none when the user chooses', () => {
  const own = [{ frameId: 'a' }, { frameId: 'b' }, { frameId: 'c' }];
  assert.equal(drawOwnFrame(own, { mode: 'editor', pick: 'b' }, null)?.frameId, 'b');
  assert.equal(drawOwnFrame(own, { mode: 'editor', pick: 'gone' }, null), null, 'a pick that is gone: the user chooses');
  assert.equal(drawOwnFrame(own, USER, null), null);
  for (const r of [0, 0.4, 0.99]) assert.notEqual(drawOwnFrame(own, RANDOM, 'a', () => r)?.frameId, 'a');
  assert.equal(drawOwnFrame([{ frameId: 'only' }], RANDOM, 'only')?.frameId, 'only');
  assert.equal(drawOwnFrame([], RANDOM, null), null);
});
