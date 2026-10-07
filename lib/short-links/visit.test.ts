import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { countVisit } from './visit';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

function fakeDb() {
  const hits: unknown[][] = [];
  const db = {
    collection: (name: string) => ({
      updateOne: async (...args: unknown[]) => { hits.push([name, ...args]); return { matchedCount: 1 }; },
      findOne: async () => null, // no tracked links: the sync step has nothing to do
    }),
  };
  return { db: db as never, hits };
}

test('a person scanning a QR link is counted once, with the kind and the phone', async () => {
  const { db, hits } = fakeDb();
  const event = { _id: new ObjectId(), messmassEventId: null };
  assert.equal(await countVisit(db, { event, slug: 'k7f3q2', kind: 'qr', method: 'GET', headers: headers({ 'user-agent': IPHONE }) }), 'counted');
  assert.equal(hits.length, 1);
  assert.equal(hits[0][0], 'short_link_hits');
  assert.deepEqual(hits[0][2], { $inc: { count: 1 }, $setOnInsert: { eventId: event._id.toString(), kind: 'qr' } });
  assert.equal((hits[0][1] as { device: string }).device, 'iphone');
});

test('a preview, a crawler, a HEAD request or a prefetch is not counted and writes nothing', async () => {
  const { db, hits } = fakeDb();
  const event = { _id: new ObjectId() };
  for (const [method, h] of [['HEAD', { 'user-agent': IPHONE }], ['GET', { 'user-agent': 'WhatsApp/2.23 A' }], ['GET', { 'user-agent': IPHONE, purpose: 'prefetch' }], ['GET', {}]] as const) {
    assert.equal(await countVisit(db, { event, slug: 's', kind: 'link', method, headers: headers({ ...h }) }), 'skipped');
  }
  assert.equal(hits.length, 0);
});

test('a database problem is reported as failed and never thrown', async () => {
  const db = { collection: () => ({ updateOne: async () => { throw new Error('down'); } }) };
  const quiet = console.error;
  console.error = () => undefined;
  try {
    assert.equal(await countVisit(db as never, { event: { _id: new ObjectId() }, slug: 's', kind: 'qr', method: 'GET', headers: headers({ 'user-agent': IPHONE }) }), 'failed');
  } finally {
    console.error = quiet;
  }
});
