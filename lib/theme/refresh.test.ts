import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { needsThemeRefresh, refreshEventTheme, refreshStaleEvents, THEME_MAX_AGE_MS, THEME_RETRY_AFTER_MS, type ThemeRefreshDeps } from './refresh';

const NOW = new Date('2026-10-06T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const linked = (extra: Record<string, unknown> = {}) => ({ _id: new ObjectId(), messmassEventId: 'm1', eventId: 'e1', frameDesign: { context: { fetchedAt: ago(1000) } }, ...extra });

test('only a linked event whose snapshot is stale or a day old, and was not tried lately, needs a refresh', () => {
  assert.equal(needsThemeRefresh(linked(), NOW), false, 'fresh');
  assert.equal(needsThemeRefresh(linked({ frameDesign: { context: { fetchedAt: ago(THEME_MAX_AGE_MS + 1) } } }), NOW), true, 'old');
  assert.equal(needsThemeRefresh(linked({ themeStale: true }), NOW), true, 'marked stale');
  assert.equal(needsThemeRefresh(linked({ frameDesign: undefined }), NOW), true, 'no snapshot yet');
  assert.equal(needsThemeRefresh(linked({ themeStale: true, themeCheckedAt: ago(THEME_RETRY_AFTER_MS - 1000) }), NOW), false, 'tried a moment ago');
  assert.equal(needsThemeRefresh(linked({ themeStale: true, themeCheckedAt: ago(THEME_RETRY_AFTER_MS + 1000) }), NOW), true);
  assert.equal(needsThemeRefresh({ _id: new ObjectId(), themeStale: true }, NOW), false, 'not linked to messmass');
});

function fakeDb() {
  const updates: Array<{ filter: unknown; update: Record<string, unknown> }> = [];
  const stale: unknown[] = [];
  const db = {
    collection: () => ({
      updateOne: async (filter: unknown, update: Record<string, unknown>) => (updates.push({ filter, update }), { matchedCount: 1 }),
      updateMany: async (filter: unknown, update: Record<string, unknown>) => (updates.push({ filter, update }), { modifiedCount: 4 }),
      find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => stale }) }) }),
      countDocuments: async () => 2,
    }),
  } as never;
  return { db, updates, stale };
}

function deps(result: { changed: boolean; messmassUnavailable?: boolean }, calls: string[], overrides: Partial<ThemeRefreshDeps> = {}): ThemeRefreshDeps {
  return {
    refresh: async () => (calls.push('refresh'), { design: { context: {}, messages: [], messagesOverridden: false, updatedAt: 'x' } as never, changed: result.changed, messmassUnavailable: result.messmassUnavailable ?? false }),
    generate: async () => (calls.push('generate'), { design: {} as never, generated: 1, reused: 0 }),
    now: () => NOW,
    ...overrides,
  };
}

test('a changed snapshot of an event with frame images draws the images that changed, and clears the stale mark', async () => {
  const { db, updates } = fakeDb();
  const calls: string[] = [];
  const outcome = await refreshEventTheme(db, linked({ themeStale: true, frameDesign: { context: {}, variants: [{}] } }), deps({ changed: true }, calls));
  assert.equal(outcome, 'updated');
  assert.deepEqual(calls, ['refresh', 'generate']);
  assert.deepEqual(updates[0].update, { $set: { themeCheckedAt: NOW.toISOString() }, $unset: { themeStale: '' } });
});

test('an event without frame images is not drawn: only its snapshot is taken', async () => {
  const { db } = fakeDb();
  const calls: string[] = [];
  assert.equal(await refreshEventTheme(db, linked(), deps({ changed: true }, calls)), 'updated');
  assert.deepEqual(calls, ['refresh']);
});

test('an unchanged snapshot draws nothing', async () => {
  const { db } = fakeDb();
  const calls: string[] = [];
  assert.equal(await refreshEventTheme(db, linked({ frameDesign: { context: {}, variants: [{}] } }), deps({ changed: false }, calls)), 'unchanged');
  assert.deepEqual(calls, ['refresh']);
});

test('when messmass does not answer the old snapshot stays, the event stays stale and is not asked again for ten minutes', async () => {
  const { db, updates } = fakeDb();
  const calls: string[] = [];
  assert.equal(await refreshEventTheme(db, linked({ themeStale: true }), deps({ changed: false, messmassUnavailable: true }, calls)), 'unavailable');
  assert.deepEqual(updates[0].update, { $set: { themeCheckedAt: NOW.toISOString() } }, 'the stale mark is kept');
});

test('a failure is recorded and never thrown', async () => {
  const { db, updates } = fakeDb();
  const quiet = console.error;
  console.error = () => undefined;
  try {
    const outcome = await refreshEventTheme(db, linked(), deps({ changed: true }, [], { refresh: async () => { throw new Error('boom'); } }));
    assert.equal(outcome, 'failed');
    assert.deepEqual(updates[0].update, { $set: { themeCheckedAt: NOW.toISOString() } });
  } finally {
    console.error = quiet;
  }
});

test('the stale run works through the events until the budget is spent and reports what remains', async () => {
  const { db, stale } = fakeDb();
  stale.push(linked({ themeStale: true }), linked({ themeStale: true }), linked({ themeStale: true }));
  let clock = NOW.getTime();
  const calls: string[] = [];
  const d = deps({ changed: false }, calls, { now: () => new Date((clock += 400)) });
  const run = await refreshStaleEvents(db, { limit: 10, budgetMs: 1000 }, d);
  assert.ok(run.refreshed >= 1 && run.refreshed < 3, `the budget stops the run (${run.refreshed})`);
  assert.equal(run.remaining, 2);
});

test('an event whose frame is made from the designers\' picture is checked at every refresh, even when the messmass data did not change', async () => {
  const { db } = fakeDb();
  const calls: string[] = [];
  const withBase = deps({ changed: false }, calls, {
    refresh: async () => (calls.push('refresh'), { design: { context: {}, messages: ['A'], messagesOverridden: true, updatedAt: 'x', base: { images: [], messageBox: { x: 0, y: 0, width: 1, height: 1 } } } as never, changed: false, messmassUnavailable: false }),
  });
  assert.equal(await refreshEventTheme(db, linked({ frameDesign: { context: {}, variants: [{}] } }), withBase), 'unchanged');
  assert.deepEqual(calls, ['refresh', 'generate']);
  const first: string[] = [];
  await refreshEventTheme(db, linked(), { ...withBase, refresh: async () => (first.push('refresh'), { design: { base: {} } as never, changed: false, messmassUnavailable: false }), generate: async () => (first.push('generate'), { design: {} as never, generated: 0, reused: 0 }) });
  assert.deepEqual(first, ['refresh', 'generate'], 'also the first time, before any image exists');
});
