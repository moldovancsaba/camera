import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { pageNumber, partnerCounts } from './list';

test('the page is a whole number from 1 to the last page; anything else is the first page', () => {
  assert.equal(pageNumber(undefined, 6), 1);
  assert.equal(pageNumber('3', 6), 3);
  assert.equal(pageNumber('99', 6), 6, 'past the end is the last page');
  assert.equal(pageNumber('999999', 6), 6);
  for (const bad of ['0', '-2', 'abc', '2.5', '', '1e3', '9999999']) assert.equal(pageNumber(bad, 6), 1, bad);
  assert.equal(pageNumber('4', 0), 1, 'no partners: still page 1');
});

type Pipeline = Array<Record<string, unknown>>;
const fakeDb = (answers: Record<string, Array<{ _id: string; n: number }>[]>) => {
  const calls: Array<{ collection: string; pipeline: Pipeline }> = [];
  const used = new Map<string, number>();
  const db = {
    collection: (name: string) => ({
      aggregate: (pipeline: Pipeline) => ({
        toArray: async () => {
          calls.push({ collection: name, pipeline });
          const at = used.get(name) ?? 0;
          used.set(name, at + 1);
          return answers[name][at];
        },
      }),
    }),
  } as unknown as Db;
  return { db, calls };
};

test('the counts of a page come from three grouped queries, with zeros for a partner that has nothing', async () => {
  const { db, calls } = fakeDb({
    [COLLECTIONS.EVENTS]: [[{ _id: 'p1', n: 4 }, { _id: 'p3', n: 1 }], [{ _id: 'p1', n: 2 }]],
    [COLLECTIONS.PARTNER_USER_ACCESS]: [[{ _id: 'p3', n: 7 }, { _id: 'someone-else', n: 9 }]],
  });
  const counts = await partnerCounts(db, ['p1', 'p2', 'p3']);
  assert.deepEqual([...counts], [
    ['p1', { events: 4, frames: 2, users: 0 }],
    ['p2', { events: 0, frames: 0, users: 0 }],
    ['p3', { events: 1, frames: 0, users: 7 }],
  ]);
  assert.equal(calls.length, 3, 'three queries, not three for every row');
  for (const call of calls) assert.deepEqual((call.pipeline[0].$match as { partnerId: unknown }).partnerId, { $in: ['p1', 'p2', 'p3'] });
  assert.deepEqual((calls[2].pipeline[0].$match as { isActive: unknown }).isActive, true, 'only active users');
});

test('no partners on the page: no queries', async () => {
  const { db, calls } = fakeDb({});
  assert.equal((await partnerCounts(db, [])).size, 0);
  assert.equal(calls.length, 0);
});
