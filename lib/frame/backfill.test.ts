import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { FRAME_SYSTEM_BAR_COLOR, FRAME_SYSTEM_HEADING_COLOR } from '@/lib/gds/tokens/colors';
import { classifyEvent, dryRun, runBackfillBatch, type BackfillDeps } from './backfill';
import { FRAME_RENDER_VERSION } from './render';

const IMAGE = 'https://teststoreid.public.blob.vercel-storage.com/frames/generated/e/a.png';

const events: Document[] = [
  { _id: 'e1', name: 'Own frame', frames: [{ isActive: true }], messmassEventId: 'm1', partnerId: 'p1' },
  { _id: 'e2', name: 'Has images', frames: [], messmassEventId: 'm2', partnerId: 'p1', frameDesign: { context: {}, variants: [{ imageUrl: IMAGE }] } },
  { _id: 'e3', name: 'Casademont Zaragoza - Basket Landes', messmassEventId: 'm3', partnerId: 'p1' },
  { _id: 'e4', name: 'Inactive own frame', frames: [{ isActive: false }], isActive: false, messmassEventId: 'm4', partnerId: 'p1' },
  { _id: 'e5', name: 'Native with logo', partnerId: 'p2' },
  { _id: 'e6', name: 'Native without logo', partnerId: 'p3', frameDesign: { context: { source: 'camera' } } },
  { _id: 'e7', name: 'Fan Day', messmassEventId: 'm7', partnerId: 'p1' },
];
const partners: Document[] = [{ partnerId: 'p1', logoUrl: 'https://i.ibb.co/x.png' }, { partnerId: 'p2', logoUrl: 'https://i.ibb.co/y.png' }, { partnerId: 'p3', logoUrl: '' }];

function fakeDb(docs: Document[] = events) {
  const find = (rows: Document[]) => (query: Record<string, unknown> = {}) => ({
    toArray: async () => rows.filter((row) => !query.partnerId || (query.partnerId as { $in: unknown[] }).$in.includes(row.partnerId)),
  });
  return {
    collection: (name: string) =>
      name === COLLECTIONS.EVENTS
        ? { find: find(docs), findOne: async (q: { _id: unknown }) => docs.find((d) => d._id === q._id) ?? null }
        : { find: find(partners) },
  } as unknown as Db;
}

const context = (name: string, over: Record<string, unknown> = {}) => ({
  event: { id: 'x', name, date: null, homeTeam: null, visitorTeam: null },
  partner: { id: 'p', name: 'Partner', logoUrl: 'https://i.ibb.co/p.png' },
  template: { id: null, name: 'Default', resolvedFrom: 'default' },
  style: { id: null, name: 'Style', resolvedFrom: 'partner', fontFamily: 'Inter', fontSource: 'google', fontFile: null, headingColor: FRAME_SYSTEM_HEADING_COLOR, heroBackground: FRAME_SYSTEM_BAR_COLOR },
  ...over,
});

function deps(over: Partial<BackfillDeps> = {}): BackfillDeps & { refreshed: string[]; generated: string[]; clock: { t: number } } {
  const refreshed: string[] = [];
  const generated: string[] = [];
  const clock = { t: 0 };
  return {
    fetchContext: async () => null,
    messmassConfigured: () => true,
    refresh: (async (_db: Db, event: Document) => (refreshed.push(String(event._id)), { design: { context: {}, messages: [] }, changed: true, messmassUnavailable: false })) as unknown as BackfillDeps['refresh'],
    generate: (async (_db: Db, event: Document) => {
      if (event._id === 'e6') throw new Error('canvas exploded');
      generated.push(String(event._id));
      return { design: event.frameDesign, generated: 5, reused: 0 };
    }) as unknown as BackfillDeps['generate'],
    now: () => clock.t,
    refreshed,
    generated,
    clock,
    ...over,
  };
}

test('an event with an active frame of its own is never touched, one with images is skipped, the rest is to do', () => {
  assert.deepEqual(classifyEvent(events[0]), { kind: 'own-frame' });
  assert.deepEqual(classifyEvent(events[1]), { kind: 'done', stale: true }, 'images made before the drawing version was kept are stale');
  assert.deepEqual(classifyEvent(events[2]), { kind: 'todo', linked: true, hasSnapshot: false, inactive: false });
  assert.deepEqual(classifyEvent(events[3]), { kind: 'todo', linked: true, hasSnapshot: false, inactive: true }, 'an inactive assignment is no frame');
  assert.deepEqual(classifyEvent(events[4]), { kind: 'todo', linked: false, hasSnapshot: false, inactive: false });
  assert.deepEqual(classifyEvent(events[5]), { kind: 'todo', linked: false, hasSnapshot: true, inactive: false });
  assert.deepEqual(classifyEvent({ _id: 'x', frames: [{ isActive: true }], frameDesign: { variants: [{ imageUrl: IMAGE }] } }), { kind: 'own-frame' }, 'an own frame wins');
  assert.deepEqual(classifyEvent({ _id: 'x', frameDesign: { variants: [{ imageUrl: IMAGE, renderVersion: FRAME_RENDER_VERSION }] } }), { kind: 'done', stale: false });
  assert.deepEqual(classifyEvent({ _id: 'x', frameDesign: { variants: [{ imageUrl: IMAGE, renderVersion: FRAME_RENDER_VERSION }, { imageUrl: IMAGE, renderVersion: FRAME_RENDER_VERSION - 1 }] } }), { kind: 'done', stale: true }, 'one old image is enough');
  assert.equal(classifyEvent({ _id: 'x', frameDesign: { context: {}, variants: [{ imageUrl: '' }] } }).kind, 'todo', 'a variant without an image is no image');
});

test('the dry run counts every outcome and writes and draws nothing', async () => {
  const d = deps();
  const report = await dryRun(fakeDb(), {}, d);
  assert.deepEqual(report, {
    total: 7, ownFrame: 1, done: 1, doneStale: 1, todo: 5, todoLinked: 3, todoNative: 2, todoInactive: 1, todoWithSnapshot: 1, nativeWithoutPartnerLogo: 1, messmassConfigured: true,
  });
  assert.deepEqual([d.refreshed, d.generated], [[], []]);
});

test('the probe asks messmass about linked events only, read-only, and summarises what the frames will show', async () => {
  const asked: string[] = [];
  const answers: Record<string, unknown> = {
    m3: context('Casademont Zaragoza - Basket Landes', { partner: { id: 'p', name: 'EuroLeague Women', logoUrl: null }, style: { ...context('x').style, resolvedFrom: 'system-default' } }),
    m4: context('Roma - Lazio', { event: { id: 'x', name: 'Roma - Lazio', date: null, homeTeam: { id: 'h', name: 'Roma', shortName: null, logoUrl: null }, visitorTeam: { id: 'v', name: 'Lazio', shortName: null, logoUrl: null } } }),
    m7: context('Fan Day', { style: { ...context('x').style, fontSource: 'custom', fontFile: '/fonts/Club.woff' } }),
  };
  const d = deps({ fetchContext: async (id) => (asked.push(id), answers[id] ?? null) });
  const report = await dryRun(fakeDb(), { probe: true }, d);
  assert.deepEqual(asked.sort(), ['m3', 'm4', 'm7']);
  assert.deepEqual(report.probe, {
    asked: 3, answered: 3, unavailable: 0, styleFrom: { 'system-default': 1, partner: 2 }, withLogo: 2, withoutLogo: 1,
    teams: { both: 1, pairingInName: 1, nameOnly: 1 }, customFont: 1,
    examples: { withoutLogo: ['Casademont Zaragoza - Basket Landes'], nameOnly: ['Fan Day'] }, incomplete: false,
  });
});

test('a probe answer that is missing counts as unavailable, and without messmass configured no probe runs', async () => {
  const d = deps({ fetchContext: async () => null });
  const report = await dryRun(fakeDb(), { probe: true }, d);
  assert.equal(report.probe?.unavailable, 3);
  assert.equal(report.probe?.answered, 0);

  const none = await dryRun(fakeDb(), { probe: true }, deps({ messmassConfigured: () => false }));
  assert.equal(none.probe, undefined);
});

test('a batch works through the events in order, within its limit, and says where to continue', async () => {
  const d = deps();
  const first = await runBackfillBatch(fakeDb(), { limit: 2, budgetMs: 60_000 }, d);
  assert.deepEqual(d.refreshed, ['e3', 'e4']);
  assert.deepEqual(d.generated, ['e3', 'e4']);
  assert.deepEqual([first.processed, first.completed, first.imagesDrawn, first.nextAfter, first.remaining, first.done], [2, 2, 10, 'e4', 3, false]);

  const quiet = console.error;
  console.error = () => {};
  const second = await runBackfillBatch(fakeDb(), { limit: 10, after: first.nextAfter, budgetMs: 60_000 }, d).finally(() => (console.error = quiet));
  assert.deepEqual(d.generated, ['e3', 'e4', 'e5', 'e7']);
  assert.deepEqual([second.processed, second.completed, second.failures.length, second.nextAfter, second.remaining, second.done], [3, 2, 1, null, 0, true]);
});

test('a linked event messmass does not answer for is not drawn from the fallback: it waits, and a native one is drawn', async () => {
  const d = deps();
  d.refresh = (async (_db: Db, event: Document) => (d.refreshed.push(String(event._id)), { design: { context: {}, messages: [] }, changed: true, messmassUnavailable: event._id === 'e3' })) as unknown as BackfillDeps['refresh'];
  const quiet = console.error;
  console.error = () => {};
  const result = await runBackfillBatch(fakeDb(), { limit: 10, budgetMs: 60_000 }, d).finally(() => (console.error = quiet));
  assert.deepEqual(result.waiting, [{ id: 'e3', name: 'Casademont Zaragoza - Basket Landes' }]);
  assert.ok(!d.generated.includes('e3'), 'no images for the waiting event');
  assert.ok(d.generated.includes('e5'), 'a camera-native event has no messmass to wait for');
  assert.equal(result.completed, 3);
});

test('with messmass not configured no linked event is touched at all, only the native ones are drawn', async () => {
  const d = deps({ messmassConfigured: () => false });
  const quiet = console.error;
  console.error = () => {};
  const result = await runBackfillBatch(fakeDb(), { limit: 10, budgetMs: 60_000 }, d).finally(() => (console.error = quiet));
  assert.deepEqual(result.waiting.map((w) => w.id), ['e3', 'e4', 'e7']);
  assert.deepEqual(d.refreshed, ['e5', 'e6']);
  assert.deepEqual(d.generated, ['e5']);
});

test('a failing event is reported and skipped, never stops the batch, and the events with a frame or images are not touched', async () => {
  const d = deps();
  const quiet = console.error;
  console.error = () => {};
  const result = await runBackfillBatch(fakeDb(), { limit: 10, budgetMs: 60_000 }, d).finally(() => (console.error = quiet));
  assert.deepEqual(result.failures, [{ id: 'e6', name: 'Native without logo', error: 'canvas exploded' }]);
  assert.deepEqual(result.waiting, []);
  assert.deepEqual(d.generated, ['e3', 'e4', 'e5', 'e7']);
  assert.ok(!d.refreshed.includes('e1') && !d.refreshed.includes('e2'));
  assert.equal(result.done, true);
});

test('the time budget stops new events from starting, after at least one', async () => {
  const d = deps();
  d.refresh = (async (_db: Db, event: Document) => {
    d.clock.t += 30_000;
    d.refreshed.push(String(event._id));
    return { design: { context: {}, messages: [] }, changed: true, messmassUnavailable: false };
  }) as unknown as BackfillDeps['refresh'];
  const result = await runBackfillBatch(fakeDb(), { limit: 10, budgetMs: 40_000 }, d);
  assert.deepEqual(d.refreshed, ['e3', 'e4'], 'the third event would start at 60 s, past the 40 s budget');
  assert.equal(result.done, false);
  assert.equal(result.nextAfter, 'e4');
});

test('an event that got its own frame or images since the listing is left alone', async () => {
  const docs = events.map((event) => (event._id === 'e3' ? { ...event, frames: [{ isActive: true }] } : event));
  const listing = fakeDb(docs);
  // The listing sees e3 as to do (stale projection), the full document says it has a frame now.
  const stale = {
    collection: (name: string) => {
      const real = (listing as unknown as { collection: (n: string) => Record<string, unknown> }).collection(name);
      return name === COLLECTIONS.EVENTS
        ? { ...real, find: () => ({ toArray: async () => events.map((e) => ({ ...e })) }) }
        : real;
    },
  } as unknown as Db;
  const d = deps();
  const result = await runBackfillBatch(stale, { limit: 10, budgetMs: 60_000 }, d);
  assert.ok(!d.refreshed.includes('e3'));
  assert.ok(d.refreshed.includes('e4'));
  assert.equal(result.failures.length, 1, 'only the event that fails on its own');
});

test('with nothing to do a batch is done at once', async () => {
  const result = await runBackfillBatch(fakeDb([events[0], events[1]]), { limit: 3, budgetMs: 1000 }, deps());
  assert.deepEqual([result.processed, result.remaining, result.done, result.nextAfter], [0, 0, true, null]);
});

test('a redraw run draws again only the events whose images are stale, never takes a snapshot, and reports like any batch', async () => {
  const docs: Document[] = [
    { _id: 'a', name: 'Old', frameDesign: { context: {}, variants: [{ imageUrl: IMAGE }] } },
    { _id: 'b', name: 'Current', frameDesign: { context: {}, variants: [{ imageUrl: IMAGE, renderVersion: FRAME_RENDER_VERSION }] } },
    { _id: 'c', name: 'No images', messmassEventId: 'm' },
    { _id: 'd', name: 'Own frame', frames: [{ isActive: true }], frameDesign: { context: {}, variants: [{ imageUrl: IMAGE }] } },
  ];
  const d = deps();
  const result = await runBackfillBatch(fakeDb(docs), { limit: 10, budgetMs: 60_000, redraw: true }, d);
  assert.deepEqual(d.generated, ['a']);
  assert.deepEqual(d.refreshed, [], 'the snapshot stays as it is');
  assert.deepEqual([result.processed, result.completed, result.imagesDrawn, result.done], [1, 1, 5, true]);
});
