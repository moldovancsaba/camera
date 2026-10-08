import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fake-db';
import { checkEventAssign, deleteLibraryUpload, loadEventLibrary, loadPartnerLibrary, savePartnerLibrary } from './db';

const EVENT = new ObjectId();
const OTHER_EVENT = new ObjectId();
const EVENT_UUID = 'uuid-event';
const OTHER_EVENT_UUID = 'uuid-other-event';
const NOW = '2026-10-08T12:00:00.000Z';

const frame = (frameId: string, extra: Record<string, unknown> = {}) => ({ frameId, name: `Frame ${frameId}`, imageUrl: `https://img.example/${frameId}.png`, isActive: true, createdAt: `2026-10-0${frameId.length}T00:00:00.000Z`, ...extra });
const assignment = (frameId: string) => ({ frameId, isActive: true, addedAt: NOW, addedBy: 'u' });

function seed() {
  return fakeDb({
    frames: [
      frame('g1'),
      frame('g2'),
      frame('g3', { isActive: false }),
      frame('p1', { scope: 'partner', partnerId: 'P' }),
      frame('x1', { scope: 'partner', partnerId: 'OTHER' }),
      frame('e1', { scope: 'event', eventId: EVENT_UUID, partnerId: 'P' }),
      frame('e2', { scope: 'event', eventId: OTHER_EVENT_UUID, partnerId: 'P' }),
    ],
    logos: [{ logoId: 'l1', name: 'Logo 1', imageUrl: 'https://img.example/l1.png', isActive: true }],
    partners: [{ partnerId: 'P', name: 'Partner P', defaultFrames: ['g1'] }],
    events: [
      { _id: EVENT, eventId: EVENT_UUID, partnerId: 'P', name: 'Event', frames: [assignment('g2'), assignment('e1'), assignment('gone')] },
      { _id: OTHER_EVENT, eventId: OTHER_EVENT_UUID, partnerId: 'P', name: 'Other event', frames: [assignment('p1')] },
    ],
  });
}

const partner = (extra: Record<string, unknown> = {}) => ({ partnerId: 'P', name: 'Partner P', defaultFrames: ['g1'], ...extra });
const ids = (items: Array<{ id: string }>) => items.map((i) => i.id).sort();

test('a partner that never saved a library has what it had: its defaults and what its events use; an event upload is not a partner item', async () => {
  const { db } = seed();
  const library = await loadPartnerLibrary(db, partner(), 'frames');
  assert.equal(library.saved, false);
  // g1 is a default; g2 and e1 are used by the event, p1 by the other one: e1 and p1 are not global, so only g1 and g2 come from the global library.
  assert.deepEqual(ids(library.items.filter((i) => i.via === 'assigned')), ['g1', 'g2']);
  assert.deepEqual(ids(library.items.filter((i) => i.via === 'own')), ['p1'], "the partner's own upload is always in its library");
  assert.deepEqual(library.missing, ['gone']);
  assert.equal(library.items.find((i) => i.id === 'g1')?.isDefault, true);
  assert.equal(library.items.find((i) => i.id === 'g2')?.isDefault, false);
});

test('the global items a partner can still add are the active ones it does not have, never an upload of someone else', async () => {
  const { db } = seed();
  const library = await loadPartnerLibrary(db, partner(), 'frames');
  assert.deepEqual(ids(library.available), [], 'g3 is switched off; g1 and g2 are already in the library');
  const saved = await loadPartnerLibrary(db, partner({ library: { frames: ['g1'] } }), 'frames');
  assert.equal(saved.saved, true);
  assert.deepEqual(ids(saved.items.filter((i) => i.via === 'assigned')), ['g1']);
  assert.deepEqual(ids(saved.available), ['g2'], 'x1, e1, e2 and p1 are not global; g3 is off');
});

test('the first save turns the computed list into the partner\'s own list for every kind, and adds what was asked', async () => {
  const { db, data } = seed();
  const result = await savePartnerLibrary(db, partner(), 'frames', { add: [] }, NOW);
  assert.deepEqual(result, { ok: true, defaults: ['g1'], defaultsChanged: false, removedInUse: {} });
  const saved = data.partners[0] as { library: { frames: string[]; logos: string[] } };
  assert.deepEqual(saved.library.frames.sort(), ['g1', 'g2'], 'nothing it had disappears; the dangling id is not carried');
  assert.deepEqual(saved.library.logos, [], 'the other kind is saved too');
});

test('adding refuses what is not a global item: unknown, switched off, or somebody else\'s upload', async () => {
  const { db, data } = seed();
  const unknown = await savePartnerLibrary(db, partner(), 'frames', { add: ['nope'] }, NOW);
  assert.deepEqual([unknown.ok, unknown.ok ? 0 : unknown.status], [false, 404]);
  const off = await savePartnerLibrary(db, partner(), 'frames', { add: ['g3'] }, NOW);
  assert.equal(off.ok, false);
  const upload = await savePartnerLibrary(db, partner(), 'frames', { add: ['x1'] }, NOW);
  assert.equal(upload.ok, false);
  assert.equal(data.partners[0].library, undefined, 'a refused edit writes nothing');
});

test('removing a default removes it from the defaults and says how many events still use the item', async () => {
  const { db, data } = seed();
  const result = await savePartnerLibrary(db, partner({ library: { frames: ['g1', 'g2'] } }), 'frames', { remove: ['g1', 'g2'] }, NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.defaults, []);
  assert.equal(result.defaultsChanged, true);
  assert.deepEqual(result.removedInUse, { g2: 1 }, 'the event that has g2 keeps it');
  assert.deepEqual((data.partners[0] as { defaultFrames: string[] }).defaultFrames, []);
  assert.deepEqual((data.partners[0] as { library: { frames: string[] } }).library.frames, []);
});

test('a default for new events must be in the library; the partner\'s own upload can be one', async () => {
  const { db } = seed();
  const outside = await savePartnerLibrary(db, partner({ library: { frames: ['g1'] } }), 'frames', { defaults: ['g2'] }, NOW);
  assert.equal(outside.ok, false);
  const own = await savePartnerLibrary(db, partner({ library: { frames: ['g1'] } }), 'frames', { defaults: ['g1', 'p1'] }, NOW);
  assert.deepEqual(own.ok && own.defaults, ['g1', 'p1']);
  const logos = await savePartnerLibrary(db, partner(), 'logos', { defaults: ['l1'] }, NOW);
  assert.equal(logos.ok, false, 'logo defaults carry a scenario and are not set here');
});

test("an event's library: what it assigned with a flag for items its partner no longer has, its own uploads, and ids that no longer exist", async () => {
  const { db } = seed();
  const event = (await db.collection('events').findOne({ _id: EVENT }))!;
  const library = await loadEventLibrary(db, event, 'frames');
  assert.equal(library.partner?.name, 'Partner P');
  assert.deepEqual(ids(library.assigned), ['e1', 'g2']);
  assert.equal(library.assigned.find((i) => i.id === 'g2')?.stillInPartnerLibrary, true, 'g2 is in the computed partner library');
  assert.equal(library.assigned.find((i) => i.id === 'e1')?.stillInPartnerLibrary, true, 'an own upload is always in');
  assert.deepEqual(library.missing.map((m) => m.id), ['gone']);
  // available: the partner library (g1, p1) the event has not taken; e2 belongs to another event.
  assert.deepEqual(ids(library.available), ['g1', 'p1']);
});

test('an item the partner removed stays on the event that has it, marked as no longer in the partner library', async () => {
  const { db } = seed();
  await savePartnerLibrary(db, partner(), 'frames', { remove: ['g2'] }, NOW);
  const event = (await db.collection('events').findOne({ _id: EVENT }))!;
  const library = await loadEventLibrary(db, event, 'frames');
  assert.equal(library.assigned.find((i) => i.id === 'g2')?.stillInPartnerLibrary, false);
});

test('an event takes an item only from its partner library or its own uploads', async () => {
  const { db } = seed();
  const event = (await db.collection('events').findOne({ _id: EVENT }))!;
  assert.equal((await checkEventAssign(db, event, 'frames', 'g1')).ok, true, 'in the partner library (a default)');
  const outside = await checkEventAssign(db, event, 'frames', 'g3');
  assert.equal(outside.ok, false, 'switched off');
  assert.equal((await checkEventAssign(db, event, 'frames', 'p1')).ok, true, "the partner's own upload");
  assert.equal((await checkEventAssign(db, event, 'frames', 'e1')).ok, true, 'its own upload');
  const other = await checkEventAssign(db, event, 'frames', 'e2');
  assert.equal(other.ok, false);
  assert.match(other.ok ? '' : other.reason, /another event/);
  const unknown = await checkEventAssign(db, event, 'frames', 'nope');
  assert.deepEqual([unknown.ok, unknown.ok ? 0 : unknown.status], [false, 404]);
});

test('an event cannot take a global item its partner does not have', async () => {
  const { db } = seed();
  const event = (await db.collection('events').findOne({ _id: EVENT }))!;
  await savePartnerLibrary(db, partner(), 'frames', { remove: ['g1', 'g2'] }, NOW);
  const refused = await checkEventAssign(db, event, 'frames', 'g1');
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? '' : refused.reason, /partner library/);
});

test('an event upload is deleted from its event with its assignment; another event\'s upload and a global item are refused', async () => {
  const { db, data } = seed();
  const refusedOther = await deleteLibraryUpload(db, 'frames', 'e2', { scope: 'event', eventId: EVENT_UUID });
  assert.equal(refusedOther.ok, false);
  const refusedGlobal = await deleteLibraryUpload(db, 'frames', 'g1', { scope: 'event', eventId: EVENT_UUID });
  assert.equal(refusedGlobal.ok, false);
  const done = await deleteLibraryUpload(db, 'frames', 'e1', { scope: 'event', eventId: EVENT_UUID });
  assert.deepEqual(done, { ok: true });
  assert.equal(data.frames.some((f) => f.frameId === 'e1'), false);
  const event = data.events.find((e) => String(e._id) === String(EVENT)) as { frames: Array<{ frameId: string }> };
  assert.deepEqual(event.frames.map((f) => f.frameId), ['g2', 'gone']);
});

test('a partner upload cannot be deleted while an event of the partner has it, and leaves the defaults when it goes', async () => {
  const { db, data } = seed();
  const busy = await deleteLibraryUpload(db, 'frames', 'p1', { scope: 'partner', partnerId: 'P' });
  assert.deepEqual([busy.ok, busy.ok ? 0 : busy.status], [false, 409]);
  await db.collection('events').updateOne({ _id: OTHER_EVENT }, { $pull: { frames: { frameId: 'p1' } } as never });
  await db.collection('partners').updateOne({ partnerId: 'P' }, { $set: { defaultFrames: ['g1', 'p1'] } });
  const done = await deleteLibraryUpload(db, 'frames', 'p1', { scope: 'partner', partnerId: 'P' });
  assert.deepEqual(done, { ok: true });
  assert.deepEqual((data.partners[0] as { defaultFrames: string[] }).defaultFrames, ['g1']);
  const wrongPartner = await deleteLibraryUpload(db, 'frames', 'x1', { scope: 'partner', partnerId: 'P' });
  assert.equal(wrongPartner.ok, false);
});
