import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { createShortLink, hitCountsBySlug, MAX_LINKS_PER_EVENT, parseNewLink, randomSlug, recordHit, resolveTrackedLink, setShortLinkActive } from './store';

/** A database of plain arrays: just the calls the store makes. */
function fakeDb(seed: { links?: Array<Record<string, unknown>>; events?: Array<Record<string, unknown>>; hits?: unknown[] } = {}) {
  const calls: Array<{ collection: string; op: string; args: unknown[] }> = [];
  const links = [...(seed.links ?? [])];
  const events = [...(seed.events ?? [])];
  const matches = (doc: Record<string, unknown>, filter: Record<string, unknown>): boolean =>
    Object.entries(filter).every(([key, want]) => {
      if (key === '$or') return (want as Array<Record<string, unknown>>).some((f) => matches(doc, f));
      if (want && typeof want === 'object' && '$ne' in (want as object)) return doc[key] !== (want as { $ne: unknown }).$ne;
      return String(doc[key]) === String(want);
    });
  const db = {
    collection(name: string) {
      const list = name === COLLECTIONS.SHORT_LINKS ? links : name === COLLECTIONS.EVENTS ? events : [];
      return {
        findOne: async (filter: Record<string, unknown>) => list.find((d) => matches(d, filter)) ?? null,
        countDocuments: async (filter: Record<string, unknown>) => list.filter((d) => matches(d, filter)).length,
        insertOne: async (doc: Record<string, unknown>) => { calls.push({ collection: name, op: 'insertOne', args: [doc] }); list.push(doc); },
        updateOne: async (...args: unknown[]) => { calls.push({ collection: name, op: 'updateOne', args }); return { matchedCount: list.some((d) => matches(d, args[0] as Record<string, unknown>)) ? 1 : 0 }; },
        aggregate: () => ({ toArray: async () => seed.hits ?? [] }),
      };
    },
  };
  return { db: db as never, calls, links };
}

test('a new link needs a placement of 1 to 60 characters and the kind qr or link; a slug is optional and checked', () => {
  assert.deepEqual(parseNewLink({ placement: '  Giant \n  screen ', kind: 'qr' }), { ok: true, placement: 'Giant screen', kind: 'qr', slug: null });
  assert.deepEqual(parseNewLink({ placement: 'Poster', kind: 'link', slug: 'MTK-Poster' }), { ok: true, placement: 'Poster', kind: 'link', slug: 'mtk-poster' });
  for (const bad of [null, {}, { placement: '', kind: 'qr' }, { placement: 'x'.repeat(61), kind: 'qr' }, { placement: 'a\u0007b', kind: 'qr' }, { placement: 'ok', kind: 'sms' }, { placement: 'ok', kind: 'qr', slug: 'a' }, { placement: 'ok', kind: 'qr', slug: 'admin' }, { placement: 'ok', kind: 'qr', slug: 'Bad Slug!' }]) {
    assert.equal(parseNewLink(bad).ok, false, JSON.stringify(bad));
  }
});

test('a random slug has six characters of an alphabet without look-alikes, and is valid as a go short slug', () => {
  const slug = randomSlug();
  assert.match(slug, /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
  assert.equal(randomSlug(() => 0), 'aaaaaa');
  assert.equal(randomSlug((max) => max - 1), '999999');
});

test('creating a link stores it active for the event, with a free slug', async () => {
  const { db, links } = fakeDb();
  const result = await createShortLink(db, 'e1', { placement: 'Giant screen', kind: 'qr' }, new Date('2026-10-07T10:00:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(links.length, 1);
  assert.deepEqual({ ...links[0], slug: 'x' }, { slug: 'x', eventId: 'e1', placement: 'Giant screen', kind: 'qr', active: true, createdAt: '2026-10-07T10:00:00.000Z' });
});

test('a chosen slug that another link or an event already uses is refused, and so is a link past the per-event limit', async () => {
  const taken = fakeDb({ links: [{ slug: 'poster', eventId: 'e2' }], events: [{ shortUrlSlug: 'mtk' }] });
  for (const slug of ['poster', 'mtk']) {
    const result = await createShortLink(taken.db, 'e1', { placement: 'x', kind: 'link', slug });
    assert.deepEqual(result, { ok: false, status: 409, error: 'This slug is already used. Choose another.' }, slug);
  }
  const full = fakeDb({ links: Array.from({ length: MAX_LINKS_PER_EVENT }, (_, i) => ({ slug: `s${i}a`, eventId: 'e1' })) });
  const refused = await createShortLink(full.db, 'e1', { placement: 'x', kind: 'qr' });
  assert.equal(refused.ok, false);
  assert.equal((refused as { status: number }).status, 409);
  assert.equal((await createShortLink(full.db, 'e9', { placement: 'x', kind: 'qr' })).ok, true, 'the limit is per event');
});

test('a hit bumps one row per link, UTC day and phone and records the event and kind only when the row is created', async () => {
  const { db, calls } = fakeDb();
  await recordHit(db, { slug: 'k7f3q2', eventId: 'e1', kind: 'qr', device: 'iphone' }, new Date('2026-10-16T22:30:00.000Z'));
  assert.deepEqual(calls[0].args, [
    { slug: 'k7f3q2', day: '2026-10-16', device: 'iphone' },
    { $inc: { count: 1 }, $setOnInsert: { eventId: 'e1', kind: 'qr' } },
    { upsert: true },
  ]);
});

test('an active link leads to its event; an inactive, unknown or orphaned link leads nowhere', async () => {
  const id = new ObjectId();
  const { db } = fakeDb({ links: [{ slug: 'on', eventId: id.toString(), kind: 'qr', active: true }, { slug: 'off', eventId: id.toString(), kind: 'qr', active: false }, { slug: 'lost', eventId: new ObjectId().toString(), kind: 'qr' }], events: [{ _id: id, messmassEventId: 'm1' }] });
  const found = await resolveTrackedLink(db, 'on');
  assert.equal(found?.link.slug, 'on');
  assert.equal(String(found?.event._id), id.toString());
  assert.equal(await resolveTrackedLink(db, 'off'), null);
  assert.equal(await resolveTrackedLink(db, 'nope'), null);
  assert.equal(await resolveTrackedLink(db, 'lost'), null);
});

test('switching a link off reports whether the event has that link', async () => {
  const { db, calls } = fakeDb({ links: [{ slug: 'on', eventId: 'e1' }] });
  assert.equal(await setShortLinkActive(db, 'e1', 'on', false), true);
  assert.deepEqual(calls[0].args, [{ eventId: 'e1', slug: 'on' }, { $set: { active: false } }]);
  assert.equal(await setShortLinkActive(db, 'e1', 'other', false), false);
});

test('the counts of a link are summed over days and phones, and today is the UTC day', async () => {
  const hits = [
    { _id: { slug: 'a', device: 'android', day: '2026-10-16' }, count: 4 },
    { _id: { slug: 'a', device: 'iphone', day: '2026-10-16' }, count: 3 },
    { _id: { slug: 'a', device: 'other', day: '2026-10-15' }, count: 2 },
    { _id: { slug: 'b', device: 'iphone', day: '2026-10-15' }, count: 1 },
  ];
  const counts = await hitCountsBySlug(fakeDb({ hits }).db, 'e1', new Date('2026-10-16T08:00:00.000Z'));
  assert.deepEqual(counts.a, { total: 9, android: 4, iphone: 3, other: 2, today: 7 });
  assert.deepEqual(counts.b, { total: 1, android: 0, iphone: 1, other: 0, today: 0 });
});
