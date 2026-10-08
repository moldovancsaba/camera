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

// Logos (camera#367): the same levels; a default carries its scenario and order, and a logo is assigned once per scenario.
const logo = (logoId: string, extra: Record<string, unknown> = {}) => ({ logoId, name: `Logo ${logoId}`, imageUrl: `https://img.example/${logoId}.png`, thumbnailUrl: `https://img.example/${logoId}.png`, isActive: true, createdAt: '2026-10-01T00:00:00.000Z', ...extra });
const row = (logoId: string, scenario: string, order: number, isActive = true) => ({ logoId, scenario, order, isActive, addedAt: NOW, addedBy: 'system' });

function seedLogos() {
  return fakeDb({
    logos: [logo('lg1'), logo('lg2'), logo('lg3', { isActive: false }), logo('lp1', { scope: 'partner', partnerId: 'P', source: 'messmass' }), logo('lx1', { scope: 'partner', partnerId: 'OTHER' }), logo('le1', { scope: 'event', eventId: EVENT_UUID, partnerId: 'P' })],
    partners: [{ partnerId: 'P', name: 'Partner P', defaultLogos: [row('lg1', 'slideshow-transition', 0), row('lg1', 'onboarding-thankyou', 1)] }],
    events: [{ _id: EVENT, eventId: EVENT_UUID, partnerId: 'P', name: 'Event', logos: [row('lg1', 'slideshow-transition', 0), row('lg1', 'onboarding-thankyou', 1), row('le1', 'loading-capture', 0)] }],
  });
}
const logoPartner = (extra: Record<string, unknown> = {}) => ({ partnerId: 'P', name: 'Partner P', defaultLogos: [row('lg1', 'slideshow-transition', 0), row('lg1', 'onboarding-thankyou', 1)], ...extra });

test('a partner that never saved a logo library has its default logos and what its events use; its own upload and its messmass logo are in it', async () => {
  const { db } = seedLogos();
  const library = await loadPartnerLibrary(db, logoPartner(), 'logos');
  assert.equal(library.saved, false);
  assert.deepEqual(ids(library.items.filter((i) => i.via === 'assigned')), ['lg1']);
  assert.deepEqual(ids(library.items.filter((i) => i.via === 'own')), ['lp1']);
  assert.equal(library.items.find((i) => i.id === 'lp1')?.source, 'messmass');
  assert.equal(library.items.find((i) => i.id === 'lg1')?.isDefault, true);
  assert.deepEqual(ids(library.available), ['lg2'], 'lg3 is off; the uploads of others are never offered');
});

test('logo defaults are saved with their scenario and order, and must be in the library', async () => {
  const { db, data } = seedLogos();
  const wanted = [{ logoId: 'lg1', scenario: 'loading-capture' as const, order: 0 }, { logoId: 'lp1', scenario: 'onboarding-thankyou' as const, order: 1 }];
  const result = await savePartnerLibrary(db, logoPartner(), 'logos', { logoDefaults: wanted }, NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.defaultsChanged, true);
  assert.deepEqual(result.logoDefaults, wanted);
  assert.deepEqual(result.defaults, ['lg1', 'lp1']);
  assert.deepEqual((data.partners[0] as { defaultLogos: unknown }).defaultLogos, wanted);
  assert.deepEqual((data.partners[0] as { library: { logos: string[] } }).library.logos, ['lg1'], 'the first save keeps what the partner had');

  const outside = await savePartnerLibrary(db, logoPartner(), 'logos', { logoDefaults: [{ logoId: 'lg2', scenario: 'loading-capture', order: 0 }] }, NOW);
  assert.deepEqual([outside.ok, outside.ok ? 0 : outside.status], [false, 400], 'lg2 is global but not in the library');
  const other = await savePartnerLibrary(db, logoPartner(), 'logos', { logoDefaults: [{ logoId: 'lx1', scenario: 'loading-capture', order: 0 }] }, NOW);
  assert.equal(other.ok, false, "another partner's upload is never a default here");
  const framesWithScenario = await savePartnerLibrary(db, logoPartner(), 'frames', { logoDefaults: wanted }, NOW);
  assert.equal(framesWithScenario.ok, false);
});

test('an edit that does not touch the logo defaults keeps them and does not cascade; removing a default logo drops its rows', async () => {
  const { db, data } = seedLogos();
  const add = await savePartnerLibrary(db, logoPartner(), 'logos', { add: ['lg2'] }, NOW);
  assert.equal(add.ok && add.defaultsChanged, false);
  assert.deepEqual(add.ok && add.logoDefaults, [{ logoId: 'lg1', scenario: 'slideshow-transition', order: 0 }, { logoId: 'lg1', scenario: 'onboarding-thankyou', order: 1 }]);
  assert.equal((data.partners[0] as { defaultLogos: unknown[] }).defaultLogos.length, 2, 'unchanged');

  const removed = await savePartnerLibrary(db, logoPartner({ library: { frames: [], logos: ['lg1', 'lg2'] } }), 'logos', { remove: ['lg1'] }, NOW);
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(removed.defaultsChanged, true);
  assert.deepEqual(removed.logoDefaults, []);
  assert.deepEqual(removed.removedInUse, { lg1: 1 }, 'the event keeps its logo, and says so');
  assert.deepEqual((data.partners[0] as { defaultLogos: unknown[] }).defaultLogos, []);
});

test('an event takes a logo of its partner library or its own; a logo it shows in one scenario stays available for another', async () => {
  const { db } = seedLogos();
  const event = (await db.collection('events').findOne({ _id: EVENT }))!;
  const library = await loadEventLibrary(db, event, 'logos');
  assert.deepEqual(library.assigned.map((e) => [e.id, e.assignment.scenario]), [['lg1', 'slideshow-transition'], ['lg1', 'onboarding-thankyou'], ['le1', 'loading-capture']], 'one entry per assignment');
  assert.deepEqual(ids(library.available), ['le1', 'lg1', 'lp1'], 'the page leaves out, per scenario, what is assigned there');
  assert.equal((await checkEventAssign(db, event, 'logos', 'lg1')).ok, true);
  assert.equal((await checkEventAssign(db, event, 'logos', 'lp1')).ok, true, "the partner's logo from messmass");
  assert.equal((await checkEventAssign(db, event, 'logos', 'le1')).ok, true);
  const global = await checkEventAssign(db, event, 'logos', 'lg2');
  assert.equal(global.ok, false);
  assert.match(global.ok ? '' : global.reason, /partner library/);
  assert.equal((await checkEventAssign(db, event, 'logos', 'lx1')).ok, false);
  assert.equal((await checkEventAssign(db, event, 'logos', 'lg3')).ok, false, 'switched off');
});

test('deleting a partner logo upload also takes it out of the defaults; an event upload goes from every scenario', async () => {
  const { db, data } = seedLogos();
  await db.collection('partners').updateOne({ partnerId: 'P' }, { $set: { defaultLogos: [row('lp1', 'loading-slideshow', 0), row('lg1', 'loading-capture', 1)] } });
  assert.deepEqual(await deleteLibraryUpload(db, 'logos', 'lp1', { scope: 'partner', partnerId: 'P' }), { ok: true });
  assert.deepEqual((data.partners[0] as { defaultLogos: Array<{ logoId: string }> }).defaultLogos.map((r) => r.logoId), ['lg1']);
  await db.collection('events').updateOne({ _id: EVENT }, { $push: { logos: row('le1', 'onboarding-thankyou', 0) } as never });
  assert.deepEqual(await deleteLibraryUpload(db, 'logos', 'le1', { scope: 'event', eventId: EVENT_UUID }), { ok: true });
  assert.deepEqual((data.events[0] as { logos: Array<{ logoId: string }> }).logos.map((r) => r.logoId), ['lg1', 'lg1']);
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
