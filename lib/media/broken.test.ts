import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { checkPicture, publicPictureOf, reportBroken, scanBatch, scanFilter, verifySubmission, type PictureCheck } from './broken';

const NOW = '2026-10-09T18:00:00.000Z';
const answer = (status: number, type = 'image/png') => (async () => new Response(null, { status, headers: { 'content-type': type } })) as unknown as typeof fetch;
const throws = (async () => {
  throw new Error('network');
}) as unknown as typeof fetch;

test('a picture is broken only when its host clearly does not have it', async () => {
  const url = 'https://i.ibb.co/NndTR67D/submission-1.png';
  assert.equal(await checkPicture(url, answer(404)), 'broken', 'ImgBB: 404 with its stand-in picture');
  assert.equal(await checkPicture(url, answer(410)), 'broken');
  assert.equal(await checkPicture(url, answer(200, 'text/html; charset=utf-8')), 'broken', 'an answer that is not an image');
  assert.equal(await checkPicture(url, answer(206)), 'ok');
  assert.equal(await checkPicture(url, answer(200)), 'ok');
});

test('an answer that cannot tell never marks anything: a timeout, a server error, a refusal, a host that is not ours', async () => {
  const url = 'https://i.ibb.co/x/a.png';
  for (const status of [500, 502, 503, 429, 403, 401]) assert.equal(await checkPicture(url, answer(status)), 'unknown', String(status));
  assert.equal(await checkPicture(url, throws), 'unknown');
  assert.equal(await checkPicture('https://evil.test/a.png', answer(404)), 'unknown', 'only our image hosts are asked');
  assert.equal(await checkPicture('http://i.ibb.co/x/a.png', answer(404)), 'unknown');
});

type Row = Record<string, unknown> & { _id: ObjectId };
function world(rows: Row[]) {
  const updates: Array<{ id: string; set: Record<string, unknown> }> = [];
  const db = {
    collection: () => ({
      updateOne: async (filter: { _id: ObjectId }, update: { $set: Record<string, unknown> }) => (updates.push({ id: String(filter._id), set: update.$set }), { matchedCount: 1 }),
      findOne: async (filter: { _id: ObjectId }) => rows.find((r) => String(r._id) === String(filter._id)) ?? null,
      countDocuments: async () => rows.filter((r) => !(r.mediaHealth as { checkedAt?: string } | undefined)).length,
      find: (filter: { $and: Array<Record<string, unknown>> }) => {
        const after = filter.$and.find((c) => '_id' in c) as { _id: { $gt: ObjectId } } | undefined;
        let found = rows.filter((r) => !(r.mediaHealth as { checkedAt?: string } | undefined) && (!after || String(r._id) > String(after._id.$gt)));
        const chain = { project: () => chain, sort: () => chain, limit: (n: number) => ((found = found.slice(0, n)), chain), toArray: async () => found };
        return chain;
      },
    }),
  } as unknown as Db;
  return { db, updates };
}
const id = (n: number) => new ObjectId(n.toString(16).padStart(24, '0'));
const row = (n: number, extra: Record<string, unknown> = {}): Row => ({ _id: id(n), imageUrl: `https://i.ibb.co/x/${n}.png`, ...extra });
const by = (map: Record<string, PictureCheck>) => async (url: string): Promise<PictureCheck> => map[url] ?? 'ok';

test('the picture the public sees is the final one, else the plain one', () => {
  assert.equal(publicPictureOf({ finalImageUrl: ' https://a/f.png ', imageUrl: 'https://a/i.png' }), 'https://a/f.png');
  assert.equal(publicPictureOf({ imageUrl: 'https://a/i.png' }), 'https://a/i.png');
  assert.equal(publicPictureOf({ imageUrl: '  ' }), null);
});

test('a gone picture is marked broken, a good one is noted as checked, and a mark is cleared when the picture answers again', async () => {
  const w = world([]);
  assert.equal(await verifySubmission(w.db, row(1), NOW, by({ 'https://i.ibb.co/x/1.png': 'broken' })), 'marked');
  assert.deepEqual(w.updates[0].set, { mediaHealth: { broken: true, reason: 'the picture is gone (http 404)', checkedAt: NOW } });
  assert.equal(await verifySubmission(w.db, row(2), NOW, by({})), 'fine');
  assert.deepEqual(w.updates[1].set, { mediaHealth: { broken: false, checkedAt: NOW } });
  assert.equal(await verifySubmission(w.db, row(3, { mediaHealth: { broken: true, checkedAt: 'old' } }), NOW, by({})), 'cleared');
  assert.equal(await verifySubmission(w.db, row(4), NOW, by({ 'https://i.ibb.co/x/4.png': 'unknown' })), 'unknown');
  assert.equal(w.updates.length, 3, 'an unclear answer writes nothing');
  assert.equal(await verifySubmission(w.db, { _id: id(5) }, NOW, by({})), 'no-picture');
});

test('a report from a screen is checked by the server, never believed; a fresh answer is not asked for again', async () => {
  const w = world([row(1), row(2, { mediaHealth: { broken: false, checkedAt: '2026-10-09T17:59:30.000Z' } })]);
  assert.equal(await reportBroken(w.db, String(id(1)), NOW, by({ 'https://i.ibb.co/x/1.png': 'ok' })), 'fine', 'the screen said broken, the host says fine: nothing is marked broken');
  assert.equal(await reportBroken(w.db, String(id(1)), NOW, by({ 'https://i.ibb.co/x/1.png': 'broken' })), 'marked');
  let asked = 0;
  assert.equal(await reportBroken(w.db, String(id(2)), NOW, async () => (asked++, 'broken')), 'fine', 'checked 30 seconds ago: not asked again');
  assert.equal(asked, 0);
  assert.equal(await reportBroken(w.db, 'not-an-id', NOW), 'not-found');
  assert.equal(await reportBroken(w.db, String(id(99)), NOW), 'not-found');
});

test('the scan walks the photos by id in bounded batches, marks the gone ones, and its filter skips recently checked photos', async () => {
  const w = world([row(1), row(2), row(3), row(4), row(5)]);
  const check = by({ 'https://i.ibb.co/x/2.png': 'broken', 'https://i.ibb.co/x/4.png': 'unknown' });
  const first = await scanBatch(w.db, { limit: 3, now: new Date(NOW) }, check);
  assert.equal(first.processed, 3);
  assert.deepEqual(first.counts, { fine: 2, marked: 1 });
  assert.equal(first.next, String(id(3)));
  const second = await scanBatch(w.db, { limit: 3, after: id(3), now: new Date(NOW) }, check);
  assert.equal(second.processed, 2);
  assert.equal(second.next, null, 'fewer than the limit: the walk is done');
  const filter = scanFilter(7, new Date(NOW)) as { $and: Array<Record<string, unknown>> };
  assert.deepEqual(filter.$and[1], { $or: [{ 'mediaHealth.checkedAt': { $exists: false } }, { 'mediaHealth.checkedAt': { $lt: '2026-10-02T18:00:00.000Z' } }] });
});
