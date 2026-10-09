import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrameVariant } from './context';
import { captureFrameOf, messageChoices, normalizeFrameChoice, pickVariant, sanitizeFrameVariant, territoriesOf, variantByIndex } from './capture';

const HOST = 'teststoreid.public.blob.vercel-storage.com';
const url = (key: string) => `https://${HOST}/frames/generated/3f2b8c1e/${key}.png`;

function variant(index: number | null, message: string | null, extra: Partial<FrameVariant> = {}): FrameVariant {
  return {
    index,
    message,
    imageUrl: url(`k${index}`),
    width: 1920,
    height: 1080,
    layers: [
      { id: 'logo', x: 1536, y: 54, width: 288, height: 162 },
      { id: 'teams', x: 192, y: 108, width: 384, height: 200 },
      { id: 'bar', x: 0, y: 853.2, width: 1920, height: 226.8 },
      { id: 'message', x: 96, y: 864, width: 1728, height: 162 },
    ],
    key: `k${index}`,
    font: { family: 'Inter', used: 'bundled', note: null, retry: false },
    logo: 'drawn',
    ...extra,
  };
}

const variants = [variant(0, 'Go! Go! Go!'), variant(1, 'We are the Best!'), variant(2, 'Together for Victory!')];

test('the generated frame applies only while the event has no active frame of its own', () => {
  assert.equal(captureFrameOf({ frames: [], frameDesign: { variants } })?.variants.length, 3);
  assert.equal(captureFrameOf({ frameDesign: { variants } })?.variants.length, 3);
  assert.equal(captureFrameOf({ frames: [{ isActive: false }], frameDesign: { variants } })?.variants.length, 3, 'an inactive assignment is no frame');
  assert.equal(captureFrameOf({ frames: [{ isActive: true }], frameDesign: { variants } }), null);
});

test('no variants, or none with an image, means no generated frame', () => {
  assert.equal(captureFrameOf({}), null);
  assert.equal(captureFrameOf({ frameDesign: { variants: [] } }), null);
  assert.equal(captureFrameOf({ frameDesign: null }), null);
  assert.equal(captureFrameOf({ frameDesign: { variants: [variant(0, 'x', { imageUrl: '' })] } }), null);
});

test('the capture view carries only what the page draws with, not the render internals', () => {
  const frame = captureFrameOf({ frameDesign: { variants } })!;
  assert.deepEqual(Object.keys(frame.variants[0]).sort(), ['height', 'imageUrl', 'index', 'layers', 'message', 'width']);
  assert.equal(frame.width, 1920);
  assert.equal(frame.height, 1080);
});

test('a shutter press never gets the variant of the press before when another exists', () => {
  const frame = captureFrameOf({ frameDesign: { variants } })!;
  for (const previous of [0, 1, 2]) {
    for (const random of [0, 0.34, 0.67, 0.999]) {
      assert.notEqual(pickVariant(frame, previous, () => random)?.index, previous);
    }
  }
  assert.equal(pickVariant(frame, null, () => 0)?.index, 0);
});

test('every variant can come up, and one variant repeats because it has to', () => {
  const frame = captureFrameOf({ frameDesign: { variants } })!;
  const seen = new Set<number | null | undefined>();
  for (const random of [0, 0.4, 0.9]) seen.add(pickVariant(frame, null, () => random)?.index);
  assert.deepEqual([...seen].sort(), [0, 1, 2]);

  const single = captureFrameOf({ frameDesign: { variants: [variant(null, null)] } })!;
  assert.equal(pickVariant(single, null)?.index, null);
  assert.equal(pickVariant(single, null)?.message, null, 'the image without a message layer is still picked');
});

test('territories are fractions of the frame, and a logo-less frame has no logo territory', () => {
  const boxes = territoriesOf(variants[0]);
  assert.deepEqual(boxes.map((box) => box.id), ['logo', 'teams', 'bar', 'message']);
  assert.deepEqual(boxes[0], { id: 'logo', left: 0.8, top: 0.05, width: 0.15, height: 0.15 });
  assert.equal(boxes[3].left, 0.05);

  const noLogo = variant(0, 'x', { layers: variants[0].layers.filter((layer) => layer.id !== 'logo'), logo: 'none' });
  assert.deepEqual(territoriesOf(noLogo).map((box) => box.id), ['teams', 'bar', 'message']);
});

test('a recorded variant keeps its position, message and image when the image is one of ours', () => {
  const claim = { index: 1, message: 'We are the Best!', imageUrl: url('abc') };
  assert.deepEqual(sanitizeFrameVariant(claim, HOST), claim);
  assert.deepEqual(sanitizeFrameVariant({ index: null, message: null, imageUrl: url('abc') }, HOST), { index: null, message: null, imageUrl: url('abc') });
});

test('a claim that is not ours is dropped so the photo still saves without it', () => {
  const ok = { index: 0, message: 'Go!', imageUrl: url('abc') };
  assert.equal(sanitizeFrameVariant(ok, null), null, 'no store configured');
  assert.equal(sanitizeFrameVariant(null, HOST), null);
  assert.equal(sanitizeFrameVariant('x', HOST), null);
  assert.equal(sanitizeFrameVariant({ ...ok, imageUrl: 'https://evil.example/frames/generated/a.png' }, HOST), null, 'other host');
  assert.equal(sanitizeFrameVariant({ ...ok, imageUrl: `http://${HOST}/frames/generated/a.png` }, HOST), null, 'not https');
  assert.equal(sanitizeFrameVariant({ ...ok, imageUrl: `https://${HOST}/originals/e/a.png` }, HOST), null, 'other folder');
  assert.equal(sanitizeFrameVariant({ ...ok, imageUrl: `https://${HOST}/frames/generated/a.jpg` }, HOST), null, 'not a png');
  assert.equal(sanitizeFrameVariant({ ...ok, imageUrl: `${url('a')}?x=1` }, HOST), null, 'query string');
  assert.equal(sanitizeFrameVariant({ ...ok, imageUrl: 42 }, HOST), null);
  assert.equal(sanitizeFrameVariant({ ...ok, index: 99 }, HOST), null);
  assert.equal(sanitizeFrameVariant({ ...ok, index: 1.5 }, HOST), null);
  assert.equal(sanitizeFrameVariant({ ...ok, index: '1' }, HOST), null);
  assert.equal(sanitizeFrameVariant({ ...ok, message: 'x'.repeat(301) }, HOST), null);
  assert.equal(sanitizeFrameVariant({ ...ok, message: 7 }, HOST), null);
});

test('a text-free frame with a message area carries the messages of the event: it is not a frame of its own, so the generated frame still applies', () => {
  const carrier = { isActive: true, frameDetails: { hasMessageArea: true } };
  const complete = { isActive: true, frameDetails: { hasMessageArea: false } };
  assert.equal(captureFrameOf({ frames: [carrier], frameDesign: { variants } })?.variants.length, 3);
  assert.equal(captureFrameOf({ frames: [carrier, complete], frameDesign: { variants } }), null, 'a complete frame next to it is a frame of its own');
  assert.equal(captureFrameOf({ frames: [{ isActive: true, frameDetails: null }], frameDesign: { variants } }), null, 'an assignment whose frame is unknown counts as before');
  assert.equal(captureFrameOf({ frames: [{ isActive: false, frameDetails: { hasMessageArea: false } }], frameDesign: { variants } })?.variants.length, 3);
});

const choiceVariant = (index: number | null, message: string | null) => ({ index, message, imageUrl: `https://img.example/${index}.png`, width: 1920, height: 1080, layers: [] });

test('only the exact word "user" lets the user choose: an event that never set it keeps the random message', () => {
  assert.equal(normalizeFrameChoice('user'), 'user');
  for (const other of ['random', 'USER', '', null, undefined, 1, true]) assert.equal(normalizeFrameChoice(other), 'random', String(other));
});

test('the messages a user can choose from are the images that carry a message, in order, and only when there are at least two', () => {
  const frame = { width: 1920, height: 1080, variants: [choiceVariant(0, 'Go Vasas'), choiceVariant(1, 'Go MTK'), choiceVariant(2, 'Together')] };
  assert.deepEqual(messageChoices(frame).map((v) => v.index), [0, 1, 2]);
  assert.deepEqual(messageChoices({ ...frame, variants: [choiceVariant(0, 'Only one')] }), [], 'one message is no choice');
  assert.deepEqual(messageChoices({ ...frame, variants: [choiceVariant(null, null), choiceVariant(0, 'One')] }), [], 'the image without a message is not a choice');
  assert.deepEqual(messageChoices(null), []);
  assert.deepEqual(messageChoices({ ...frame, variants: [choiceVariant(null, null), choiceVariant(0, 'A'), choiceVariant(1, 'B')] }).map((v) => v.message), ['A', 'B']);
});

test('the variant a user chose is found by its position in the message list', () => {
  const frame = { width: 1920, height: 1080, variants: [choiceVariant(0, 'A'), choiceVariant(1, 'B')] };
  assert.equal(variantByIndex(frame, 1)?.message, 'B');
  assert.equal(variantByIndex(frame, 7), null);
  assert.equal(variantByIndex(frame, null), null);
  assert.equal(variantByIndex(null, 0), null);
});
