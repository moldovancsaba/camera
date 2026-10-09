import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { runScreenBackfillBatch, screenBackfillFilter, screenBackfillStatus } from './screen-backfill';

interface Row { _id: ObjectId; imageUrl: string; done?: boolean }

/** A fake database that answers the three kinds of call the batch makes. */
function world(rows: Row[], events = ['e1']) {
  const queries: unknown[] = [];
  const open = () => rows.filter((row) => !row.done);
  const db = {
    collection: () => ({
      distinct: async () => events,
      countDocuments: async () => open().length,
      find: (filter: { $and: Array<Record<string, unknown>> }) => {
        queries.push(filter);
        const after = filter.$and.find((clause) => '_id' in clause) as { _id: { $gt: ObjectId } } | undefined;
        let result = open().filter((row) => !after || row._id.toString() > after._id.$gt.toString());
        const chain = { project: () => chain, sort: () => chain, limit: (n: number) => ((result = result.slice(0, n)), chain), toArray: async () => result };
        return chain;
      },
    }),
  } as unknown as Db;
  return { db, queries, rows };
}
const id = (n: number) => new ObjectId(n.toString(16).padStart(24, '0'));
const photos = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ _id: id(i + 1), imageUrl: `https://x.test/${i}.jpg` }));

test('the filter is photos of slideshow events that can be seen on a screen and lack a screen picture, from an id on', () => {
  const filter = screenBackfillFilter(['e1', 'e2'], id(5)) as { $and: Array<Record<string, unknown>> };
  assert.deepEqual(filter.$and[0], { $or: [{ eventIds: { $in: ['e1', 'e2'] } }, { eventId: { $in: ['e1', 'e2'] } }] });
  assert.deepEqual(filter.$and.find((c) => 'screenImageUrl' in c), { screenImageUrl: { $in: [null, ''] } });
  assert.deepEqual(filter.$and.find((c) => 'reviewStatus' in c), { reviewStatus: { $nin: ['pending_review', 'rejected'] } });
  assert.deepEqual(filter.$and.at(-1), { _id: { $gt: id(5) } });
  assert.equal((screenBackfillFilter(['e1']) as { $and: unknown[] }).$and.some((c) => '_id' in (c as object)), false);
});

test('a batch makes at most its limit, walks on by id, and says where to continue and what is left', async () => {
  const w = world(photos(7));
  const ensured: string[] = [];
  const ensure = async (_db: Db, s: { _id: ObjectId }) => {
    ensured.push(String(s._id));
    (w.rows.find((r) => String(r._id) === String(s._id)) as Row).done = true;
    return { outcome: 'made' as const, sourceBytes: 1000, screenBytes: 200 };
  };
  const first = await runScreenBackfillBatch(w.db, { limit: 3 }, ensure);
  assert.equal(first.processed, 3);
  assert.deepEqual(first.counts, { made: 3 });
  assert.deepEqual([first.beforeBytes, first.afterBytes], [3000, 600]);
  assert.equal(first.next, String(id(3)));
  assert.equal(first.remaining, 4);
  const second = await runScreenBackfillBatch(w.db, { limit: 3, after: id(3) }, ensure);
  assert.deepEqual(ensured.slice(3), [String(id(4)), String(id(5)), String(id(6))]);
  assert.equal(second.next, String(id(6)));
  const last = await runScreenBackfillBatch(w.db, { limit: 3, after: id(6) }, ensure);
  assert.equal(last.processed, 1);
  assert.equal(last.next, null, 'fewer than the limit: the walk is done');
  assert.equal(last.remaining, 0);
});

test('a photo that cannot be made is passed over once: the walk moves on and ends, even though it stays without a picture', async () => {
  const w = world(photos(4));
  const ensure = async (_db: Db, s: { _id: ObjectId }) => (String(s._id) === String(id(2)) ? { outcome: 'failed' as const } : ((w.rows.find((r) => String(r._id) === String(s._id)) as Row).done = true, { outcome: 'reused-original' as const, sourceBytes: 10, screenBytes: 10 }));
  let after: ObjectId | undefined;
  const counts: Record<string, number> = {};
  for (let guard = 0; guard < 10; guard++) {
    const batch = await runScreenBackfillBatch(w.db, { limit: 2, after }, ensure);
    for (const [k, v] of Object.entries(batch.counts)) counts[k] = (counts[k] ?? 0) + (v ?? 0);
    if (!batch.next) {
      assert.equal(batch.remaining, 1, 'the failed one is still without a picture');
      break;
    }
    after = new ObjectId(batch.next);
    assert.ok(guard < 9, 'the walk must end');
  }
  assert.deepEqual(counts, { 'reused-original': 3, failed: 1 });
});

test('the batch is bounded (at most 48, at least 1), and with no slideshow event nothing is looked at', async () => {
  const w = world(photos(60));
  const big = await runScreenBackfillBatch(w.db, { limit: 500 }, async () => ({ outcome: 'exists' as const }));
  assert.equal(big.processed, 48);
  const small = await runScreenBackfillBatch(w.db, { limit: 0 }, async () => ({ outcome: 'exists' as const }));
  assert.equal(small.processed, 1);
  const none = world(photos(3), []);
  assert.deepEqual(await runScreenBackfillBatch(none.db, {}, async () => ({ outcome: 'made' as const })), { processed: 0, counts: {}, beforeBytes: 0, afterBytes: 0, next: null, remaining: 0 });
  assert.deepEqual(await screenBackfillStatus(none.db), { remaining: 0, events: 0 });
  assert.deepEqual(await screenBackfillStatus(world(photos(5)).db), { remaining: 5, events: 1 });
  assert.deepEqual(await screenBackfillStatus(world(photos(5)).db, 'other-event'), { remaining: 0, events: 0 });
});
