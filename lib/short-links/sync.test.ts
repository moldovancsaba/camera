import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { SYNC_THROTTLE_MS, syncLinkStats, type SyncDeps } from './sync';
import type { LinkStatTotals } from './totals';

const T0 = new Date('2026-10-16T18:00:00.000Z');
const rows = [{ _id: { kind: 'qr', device: 'android' }, count: 3 }, { _id: { kind: 'qr', device: 'iphone' }, count: 2 }, { _id: { kind: 'link', device: 'other' }, count: 1 }];
const TOTALS: LinkStatTotals = { visitQrCode: 5, visitShortUrl: 1, qrscanAndroid: 3, qrscanIphone: 2 };

/** One event with an editable `shortLinkSync`, links yes or no, and the hit rows. */
function setup(options: { tracked?: boolean; sync?: { pushedAt?: string; totals?: LinkStatTotals } } = {}) {
  const event: { _id: ObjectId; messmassEventId: string; shortLinkSync?: { pushedAt?: string; totals?: LinkStatTotals } } = { _id: new ObjectId(), messmassEventId: 'a'.repeat(24), ...(options.sync ? { shortLinkSync: { ...options.sync } } : {}) };
  const writes: unknown[] = [];
  const db = {
    collection: (name: string) => {
      if (name === COLLECTIONS.SHORT_LINKS) return { findOne: async () => (options.tracked === false ? null : { _id: 1 }) };
      if (name === COLLECTIONS.SHORT_LINK_HITS) return { aggregate: () => ({ toArray: async () => rows }) };
      return {
        findOneAndUpdate: async (filter: { $or?: Array<Record<string, unknown>> }, update: { $set: Record<string, string> }) => {
          const threshold = (filter.$or?.[1]?.['shortLinkSync.pushedAt'] as { $lt: string } | undefined)?.$lt;
          const pushedAt = event.shortLinkSync?.pushedAt;
          if (threshold && pushedAt && !(pushedAt < threshold)) return null;
          const before = { shortLinkSync: event.shortLinkSync ? { ...event.shortLinkSync } : undefined };
          event.shortLinkSync = { ...event.shortLinkSync, pushedAt: update.$set['shortLinkSync.pushedAt'] };
          return before;
        },
        updateOne: async (_filter: unknown, update: { $set: Record<string, LinkStatTotals> }) => {
          writes.push(update);
          event.shortLinkSync = { ...event.shortLinkSync, totals: update.$set['shortLinkSync.totals'] };
        },
      };
    },
  };
  const pushed: Array<{ id: string; totals: LinkStatTotals }> = [];
  const deps = (ok = true, now = T0): SyncDeps => ({ push: async (id, totals) => { pushed.push({ id, totals }); return ok; }, now: () => now });
  return { event, db: db as never, pushed, deps, writes };
}

test('the first push sends the totals and remembers them with the time', async () => {
  const s = setup();
  assert.equal(await syncLinkStats(s.db, s.event, {}, s.deps()), 'pushed');
  assert.deepEqual(s.pushed, [{ id: 'a'.repeat(24), totals: TOTALS }]);
  assert.deepEqual(s.event.shortLinkSync, { pushedAt: T0.toISOString(), totals: TOTALS });
});

test('inside the throttle window nothing is sent, and after it the new totals are', async () => {
  const s = setup({ sync: { pushedAt: new Date(T0.getTime() - SYNC_THROTTLE_MS + 1000).toISOString(), totals: { ...TOTALS, visitQrCode: 1 } } });
  assert.equal(await syncLinkStats(s.db, s.event, {}, s.deps()), 'throttled');
  assert.equal(s.pushed.length, 0);
  const later = new Date(T0.getTime() + 2000);
  assert.equal(await syncLinkStats(s.db, s.event, {}, s.deps(true, later)), 'pushed');
  assert.equal(s.pushed.length, 1);
});

test('totals that have not changed since the last good push are not sent again', async () => {
  const s = setup({ sync: { pushedAt: new Date(T0.getTime() - 5 * SYNC_THROTTLE_MS).toISOString(), totals: TOTALS } });
  assert.equal(await syncLinkStats(s.db, s.event, {}, s.deps()), 'unchanged');
  assert.equal(s.pushed.length, 0);
});

test('forcing (the admin panel) ignores the throttle and the unchanged check', async () => {
  const s = setup({ sync: { pushedAt: T0.toISOString(), totals: TOTALS } });
  assert.equal(await syncLinkStats(s.db, s.event, { force: true }, s.deps()), 'pushed');
  assert.equal(s.pushed.length, 1);
});

test('a refused push is reported, keeps the old totals, and is repeated after the window', async () => {
  const s = setup({ sync: { pushedAt: new Date(T0.getTime() - 5 * SYNC_THROTTLE_MS).toISOString(), totals: { ...TOTALS, visitQrCode: 1 } } });
  assert.equal(await syncLinkStats(s.db, s.event, {}, s.deps(false)), 'failed');
  assert.equal(s.writes.length, 0);
  assert.equal(s.event.shortLinkSync?.totals?.visitQrCode, 1);
  assert.equal(await syncLinkStats(s.db, s.event, {}, s.deps(true, new Date(T0.getTime() + 2 * SYNC_THROTTLE_MS))), 'pushed');
});

test('an event with no tracked links, or not linked to messmass, is never pushed', async () => {
  const none = setup({ tracked: false });
  assert.equal(await syncLinkStats(none.db, none.event, {}, none.deps()), 'not_tracked');
  const unlinked = setup();
  assert.equal(await syncLinkStats(unlinked.db, { _id: unlinked.event._id, messmassEventId: null }, {}, unlinked.deps()), 'not_linked');
  assert.equal(none.pushed.length + unlinked.pushed.length, 0);
});
