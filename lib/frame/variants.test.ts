import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { contextHash, nativeFrameContext, type FrameDesign } from './context';
import { resolveFrameFont } from './fonts';
import { DEFAULT_FRAME_MESSAGES } from './messages';
import { FRAME_RENDER_VERSION } from './render';
import { generateFrameVariants, variantKey, type VariantDeps } from './variants';

const NOW = '2026-10-06T12:00:00.000Z';
const WHITE = `${CAMERA_STAGE_WHITE}FF`;
const BAR = `${CAMERA_DEFAULT_BRAND_COLOR}FF`;

function design(over: Partial<FrameDesign['context']['event']> = {}, messages: string[] = [...DEFAULT_FRAME_MESSAGES], logoUrl: string | null = 'https://i.ibb.co/a/l.png'): FrameDesign {
  const base = nativeFrameContext({ eventName: 'El Clásico', partnerName: 'FC Barcelona', partnerLogoUrl: logoUrl }, NOW);
  const context = {
    ...base,
    event: { ...base.event, homeTeam: { id: 'h', name: 'FC Barcelona', shortName: null, logoUrl: null }, visitorTeam: { id: 'v', name: 'Real Madrid', shortName: null, logoUrl: null }, ...over },
    style: { ...base.style, headingColor: WHITE, heroBackground: BAR },
  };
  return { context: { ...context, inputHash: contextHash(context) }, messages, messagesOverridden: false, updatedAt: NOW };
}

const eventId = 'evt-uuid-1';
const event = (d: FrameDesign) => ({ _id: new ObjectId(), eventId, name: 'El Clásico', frameDesign: d });

function harness(over: Partial<VariantDeps> = {}) {
  const uploads: string[] = [];
  const logoCalls: string[] = [];
  const writes: Array<Record<string, unknown>> = [];
  const db = { collection: () => ({ updateOne: async (_f: unknown, u: { $set: Record<string, unknown> }) => (writes.push(u.$set), { matchedCount: 1 }) }) } as unknown as Db;
  const deps: VariantDeps = {
    upload: async (pathname) => (uploads.push(pathname), `https://blob.test/${pathname}`),
    fetchLogo: async (url) => (logoCalls.push(url), null),
    fetchBaseImage: async () => null,
    resolveFont: (style) => resolveFrameFont(style),
    now: () => NOW,
    ...over,
  };
  return { db, deps, uploads, logoCalls, writes };
}

test('one image per usable message, stored under the event with a deterministic path, with the layer boxes', async () => {
  const { db, deps, uploads, writes } = harness();
  const e = event(design());
  const result = await generateFrameVariants(db, e, deps);

  assert.equal(result.generated, 5);
  assert.equal(result.reused, 0);
  const variants = result.design.variants!;
  assert.deepEqual(variants.map((v) => v.index), [0, 1, 2, 3, 4]);
  assert.equal(variants[1].message, 'Let’s Go, FC Barcelona');
  assert.equal(uploads.length, 5);
  for (const pathname of uploads) assert.match(pathname, new RegExp(`^frames/generated/${eventId}/[0-9a-f]{32}\\.png$`));
  assert.equal(variants[0].imageUrl, `https://blob.test/${uploads[0]}`);
  assert.deepEqual(variants[0].layers.map((l) => l.id), ['teams', 'bar', 'message']);
  assert.deepEqual([variants[0].width, variants[0].height], [1920, 1080]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]['frameDesign.generatedAt'], NOW);
  assert.equal((writes[0]['frameDesign.variants'] as unknown[]).length, 5);
});

test('a message that needs a team name is skipped for an event without one', async () => {
  const { db, deps } = harness();
  const e = event(design({ homeTeam: null, visitorTeam: null }));
  const variants = (await generateFrameVariants(db, e, deps)).design.variants!;
  assert.deepEqual(variants.map((v) => v.index), [0, 2, 3, 4]);
});

test('with no usable message there is one image without a message layer', async () => {
  const { db, deps } = harness();
  const e = event(design({ homeTeam: null, visitorTeam: null }, ['Hello {partner1}']));
  const variants = (await generateFrameVariants(db, e, deps)).design.variants!;
  assert.equal(variants.length, 1);
  assert.equal(variants[0].index, null);
  assert.equal(variants[0].message, null);
  assert.equal(variants[0].layers.some((l) => l.id === 'message'), false);
});

test('unchanged inputs reuse the stored images: no render, no upload, no logo fetch', async () => {
  // No logo: a logo that could not be fetched is deliberately not reused (see the logo test below).
  const first = harness();
  const e = event(design({}, [...DEFAULT_FRAME_MESSAGES], null));
  const generated = (await generateFrameVariants(first.db, e, first.deps)).design;

  const second = harness();
  const again = await generateFrameVariants(second.db, event(generated), second.deps);
  assert.equal(again.generated, 0);
  assert.equal(again.reused, 5);
  assert.equal(second.uploads.length, 0);
  assert.equal(second.logoCalls.length, 0);
  assert.deepEqual(again.design.variants!.map((v) => v.imageUrl), generated.variants!.map((v) => v.imageUrl));
});

test('a changed colour renders everything again; one edited message renders only that one', async () => {
  const base = harness();
  const generated = (await generateFrameVariants(base.db, event(design({}, [...DEFAULT_FRAME_MESSAGES], null)), base.deps)).design;

  const recoloured = { ...generated, context: { ...generated.context, style: { ...generated.context.style, heroBackground: `${CAMERA_STAGE_WHITE}80` } } };
  recoloured.context.inputHash = contextHash(recoloured.context);
  const a = harness();
  assert.equal((await generateFrameVariants(a.db, event(recoloured), a.deps)).generated, 5);

  const edited = { ...generated, messages: generated.messages.map((m, i) => (i === 2 ? 'We are the Champions!' : m)) };
  const b = harness();
  const result = await generateFrameVariants(b.db, event(edited), b.deps);
  assert.equal(result.generated, 1);
  assert.equal(result.reused, 4);
});

test('a logo that could not be fetched is retried at the next generation; a missing logo is not fetched at all', async () => {
  const first = harness();
  const generated = (await generateFrameVariants(first.db, event(design()), first.deps)).design;
  assert.ok(generated.variants!.every((v) => v.logo === 'failed'));
  assert.equal(first.logoCalls.length, 1, 'the logo is fetched once for all variants');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const retry = harness({ fetchLogo: async () => png });
  const result = await generateFrameVariants(retry.db, event(generated), retry.deps);
  assert.equal(result.generated, 5);
  assert.ok(result.design.variants!.every((v) => v.logo === 'drawn'));

  const none = harness();
  const withoutLogo = await generateFrameVariants(none.db, event(design({}, [...DEFAULT_FRAME_MESSAGES], null)), none.deps);
  assert.equal(none.logoCalls.length, 0);
  assert.ok(withoutLogo.design.variants!.every((v) => v.logo === 'none'));
});

test('a font fetch that failed is retried at the next generation', async () => {
  const failing = async (style: FrameDesign['context']['style']) => ({ ...(await resolveFrameFont({ ...style, fontFamily: 'Inter' })), used: 'fallback' as const, note: 'custom font could not be fetched', retry: true });
  const first = harness({ resolveFont: failing });
  const generated = (await generateFrameVariants(first.db, event(design()), first.deps)).design;
  assert.ok(generated.variants!.every((v) => v.font.retry));

  const second = harness();
  assert.equal((await generateFrameVariants(second.db, event(generated), second.deps)).generated, 5);
});

test('a failed upload throws and writes nothing, so the previous images stay', async () => {
  const { db, deps, writes } = harness({ upload: async () => { throw new Error('blob unavailable'); } });
  await assert.rejects(generateFrameVariants(db, event(design()), deps), /blob unavailable/);
  assert.equal(writes.length, 0);
});

test('an event without a snapshot cannot be rendered', async () => {
  const { db, deps } = harness();
  await assert.rejects(generateFrameVariants(db, { _id: new ObjectId(), eventId }, deps), /no snapshot/);
});

test('the key depends on what is drawn, the message and the font, and not on when it was fetched', () => {
  const d = design();
  const font = { family: 'frame-inter', stack: '', used: 'bundled' as const, note: null, retry: false };
  const key = variantKey(d, 'Go!', font);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(variantKey({ ...d, context: { ...d.context, fetchedAt: 'later' } }, 'Go!', font), key);
  assert.notEqual(variantKey(d, 'Go! Go!', font), key);
  assert.notEqual(variantKey(d, 'Go!', { ...font, family: 'frame-roboto' }), key);
});

test('on a competition event the placeholders take the two sides of the pairing in the event name', async () => {
  const { db, deps } = harness();
  const competition = { id: 'c', name: 'EuroLeague Women', shortName: null, logoUrl: null };
  const e = event(design({ name: 'Casademont Zaragoza - Basket Landes', homeTeam: competition, visitorTeam: null }, ['Let’s Go, {partner1}', 'Against {partner2}', 'Go!']));
  const variants = (await generateFrameVariants(db, e, deps)).design.variants!;
  assert.deepEqual(variants.map((v) => v.message), ['Let’s Go, Casademont Zaragoza', 'Against Basket Landes', 'Go!']);
});

test('real home and visitor teams win over the event name, and a lone team keeps its name when the name is no pairing', async () => {
  const { db, deps } = harness();
  const both = event(design({ name: 'Roma - Lazio' }, ['Let’s Go, {partner1}', 'Against {partner2}']));
  assert.deepEqual((await generateFrameVariants(db, both, deps)).design.variants!.map((v) => v.message), ['Let’s Go, FC Barcelona', 'Against Real Madrid']);

  const lone = event(design({ name: 'Fan Day', visitorTeam: null }, ['Let’s Go, {partner1}', 'Against {partner2}']));
  assert.deepEqual((await generateFrameVariants(db, lone, deps)).design.variants!.map((v) => v.message), ['Let’s Go, FC Barcelona']);
});

test('with no partner logo the event emoji is the logo, and the name and the messages are used without it', async () => {
  const { db, deps } = harness();
  const e = event(design({ name: '⚽ DVTK x Kazincbarcika', homeTeam: null, visitorTeam: null }, ['Go {partner1}!'], null));
  const variant = (await generateFrameVariants(db, e, deps)).design.variants![0];
  assert.equal(variant.message, 'Go DVTK!', 'the emoji is not in the message');
  assert.equal(variant.logo, 'emoji');
  assert.equal(variant.renderVersion, FRAME_RENDER_VERSION);
  assert.ok(variant.layers.some((layer) => layer.id === 'logo'), 'a logo layer, so the live view has its territory');
});

test('a partner with a logo keeps the name as it is: the emoji stays in the name and is not drawn as a logo', async () => {
  const { db, deps } = harness();
  const e = event(design({ name: '⚽ DVTK x Kazincbarcika', homeTeam: null, visitorTeam: null }, ['Go {partner1}!']));
  const variant = (await generateFrameVariants(db, e, deps)).design.variants![0];
  assert.equal(variant.message, 'Go ⚽ DVTK!');
  assert.notEqual(variant.logo, 'emoji');
});

test('an event with no logo and no emoji has no logo layer, as before', async () => {
  const { db, deps } = harness();
  const variant = (await generateFrameVariants(db, event(design({ name: 'Fan Day', homeTeam: null, visitorTeam: null }, ['Go!'], null)), deps)).design.variants![0];
  assert.equal(variant.logo, 'none');
  assert.equal(variant.layers.some((layer) => layer.id === 'logo'), false);
});

// --- A message written on the frame it chose (camera#366) ---------------------------------------------------------------------------------------------------

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const AREA = { messageBox: { x: 520, y: 8, width: 880, height: 90 }, messageColor: '#ffffff' };
const libraryFrame = (frameId: string, extra: Record<string, unknown> = {}) => ({ frameId, name: `Frame ${frameId}`, imageUrl: `https://i.ibb.co/${frameId}.png`, isActive: true, messageArea: AREA, ...extra });
const assignment = (frameId: string, isActive = true) => ({ frameId, isActive, addedAt: 'x', addedBy: 'u' });

async function chosenHarness(frames: Array<Record<string, unknown>>) {
  const { fakeDb } = await import('@/lib/library/fake-db');
  const { db, data } = fakeDb({ frames, events: [] });
  const uploads: string[] = [];
  const fetched: string[] = [];
  const deps: VariantDeps = {
    upload: async (pathname) => (uploads.push(pathname), `https://blob.test/${pathname}`),
    fetchLogo: async () => null,
    fetchBaseImage: async (url) => (fetched.push(url), PNG),
    resolveFont: (style) => resolveFrameFont(style),
    now: () => NOW,
  };
  return { db, data, deps, uploads, fetched };
}

test('a message is written on the frame it chose; the others keep the layout; each picture is fetched once', async () => {
  const h = await chosenHarness([libraryFrame('f-blue'), libraryFrame('f-pink')]);
  const d: FrameDesign = { ...design({}, ['HAJRÁ', 'MTK SZÍV!', 'Go!', 'HAJRÁ MTK']), messageFrames: { HAJRÁ: 'f-blue', 'HAJRÁ MTK': 'f-blue', 'MTK SZÍV!': 'f-pink' } };
  const e = { ...event(d), frames: [assignment('f-blue'), assignment('f-pink')] };
  const result = await generateFrameVariants(h.db, e, h.deps);
  const variants = result.design.variants!;
  assert.deepEqual(variants.map((v) => [v.message, v.frameId ?? null]), [['HAJRÁ', 'f-blue'], ['MTK SZÍV!', 'f-pink'], ['Go!', null], ['HAJRÁ MTK', 'f-blue']]);
  assert.deepEqual(h.fetched.sort(), ['https://i.ibb.co/f-blue.png', 'https://i.ibb.co/f-pink.png'], 'one fetch per picture, not per message');
  assert.equal(result.generated, 4);
  assert.ok(variants.every((v) => v.width === 1920 && v.height === 1080));
  assert.equal(new Set(variants.map((v) => v.key)).size, 4, 'every image has its own key');
});

test('a chosen frame that is not assigned, switched off for the event or in the library, or without a message area is ignored: the message keeps the layout', async () => {
  const h = await chosenHarness([libraryFrame('f-ok'), libraryFrame('f-off', { isActive: false }), libraryFrame('f-plain', { messageArea: undefined }), libraryFrame('f-not-assigned')]);
  const d: FrameDesign = { ...design({}, ['A', 'B', 'C', 'D']), messageFrames: { A: 'f-ok', B: 'f-off', C: 'f-plain', D: 'f-not-assigned' } };
  const e = { ...event(d), frames: [assignment('f-ok', false), assignment('f-off'), assignment('f-plain')] };
  const variants = (await generateFrameVariants(h.db, e, h.deps)).design.variants!;
  assert.deepEqual(variants.map((v) => v.frameId ?? null), [null, null, null, null], 'f-ok is switched off for the event');
  assert.deepEqual(h.fetched, []);
});

test('images are reused while the frame, its message area and the message are unchanged, and only the messages of a changed frame are redrawn', async () => {
  const h = await chosenHarness([libraryFrame('f-blue'), libraryFrame('f-pink')]);
  const d: FrameDesign = { ...design({}, ['A', 'B']), messageFrames: { A: 'f-blue', B: 'f-pink' } };
  const e = { ...event(d), frames: [assignment('f-blue'), assignment('f-pink')] };
  const first = await generateFrameVariants(h.db, e, h.deps);
  assert.equal(first.generated, 2);

  const again = await chosenHarness([libraryFrame('f-blue'), libraryFrame('f-pink')]);
  const same = await generateFrameVariants(again.db, { ...e, frameDesign: first.design }, again.deps);
  assert.deepEqual([same.generated, same.reused], [0, 2]);
  assert.deepEqual(again.fetched, [], 'a reused image needs no picture');

  const moved = await chosenHarness([libraryFrame('f-blue', { messageArea: { ...AREA, messageBox: { x: 100, y: 8, width: 880, height: 90 } } }), libraryFrame('f-pink')]);
  const result = await generateFrameVariants(moved.db, { ...e, frameDesign: first.design }, moved.deps);
  assert.deepEqual([result.generated, result.reused], [1, 1], 'only the blue message is drawn again');
});

test('a message with no chosen frame keeps exactly the key it always had, so nothing is redrawn when other messages choose a frame', () => {
  const d = design();
  const font = { family: 'frame-inter', stack: '', used: 'bundled' as const, note: null, retry: false };
  const before = variantKey(d, 'Go!', font);
  assert.equal(variantKey({ ...d, messageFrames: { 'Other message': 'f1' } }, 'Go!', font), before);
  const frame = { frameId: 'f1', name: 'F', imageUrl: 'https://i.ibb.co/f1.png', area: AREA };
  assert.notEqual(variantKey(d, 'Go!', font, frame), before);
  assert.notEqual(variantKey(d, 'Go!', font, { ...frame, imageUrl: 'https://i.ibb.co/f2.png' }), variantKey(d, 'Go!', font, frame), 'a new picture redraws');
});

test('a chosen frame wins over the older base picture of the event for its message only', async () => {
  const h = await chosenHarness([libraryFrame('f-blue')]);
  const base = { images: [{ key: 'old', imageUrl: 'https://i.ibb.co/old.png' }], messageBox: AREA.messageBox };
  const d: FrameDesign = { ...design({}, ['A', 'B']), base, messageFrames: { A: 'f-blue' } };
  const e = { ...event(d), frames: [assignment('f-blue')] };
  const variants = (await generateFrameVariants(h.db, e, h.deps)).design.variants!;
  assert.deepEqual(variants.map((v) => v.frameId ?? null), ['f-blue', null]);
  assert.deepEqual(h.fetched.sort(), ['https://i.ibb.co/f-blue.png', 'https://i.ibb.co/old.png']);
});

test('a chosen frame whose picture cannot be fetched fails the run and writes nothing', async () => {
  const h = await chosenHarness([libraryFrame('f-blue')]);
  const d: FrameDesign = { ...design({}, ['A']), messageFrames: { A: 'f-blue' } };
  const e = { ...event(d), frames: [assignment('f-blue')] };
  await assert.rejects(generateFrameVariants(h.db, e, { ...h.deps, fetchBaseImage: async () => null }), /could not be fetched/);
  assert.deepEqual(h.uploads, []);
});
