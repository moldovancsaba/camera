import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { deleteLibraryUpload, usageOfItem } from '@/lib/library/db';
import { keepLostLogoAsOwn, loadEventLogoPanels, loadPartnerLogoPanel, parseSlotValue, setEventLogoSlot, setPartnerLogo } from './logo-store';

const NOW = '2026-10-09T10:00:00.000Z';
const logo = (logoId: string, extra: Record<string, unknown> = {}) => ({ logoId, name: `Logo ${logoId}`, imageUrl: `https://img.example/${logoId}.png`, thumbnailUrl: `https://img.example/${logoId}-t.png`, isActive: true, createdAt: NOW, ...extra });
const legacy = (logoId: string, scenario: string, order = 0, isActive = true) => ({ logoId, scenario, order, isActive, addedAt: NOW, addedBy: 'system' });

function seed(extra: { partner?: Record<string, unknown>; event?: Record<string, unknown> } = {}) {
  return fakeDb({
    logos: [
      logo('g1'),
      logo('g2'),
      logo('g3', { isActive: false }),
      logo('p1', { scope: 'partner', partnerId: 'P', source: 'messmass' }),
      logo('x1', { scope: 'partner', partnerId: 'OTHER' }),
      logo('e1', { scope: 'event', eventId: 'e-uuid', partnerId: 'P' }),
      logo('e2', { scope: 'event', eventId: 'other-uuid', partnerId: 'P' }),
    ],
    partners: [{ partnerId: 'P', name: 'Partner P', library: { frames: [], logos: ['g1'] }, ...extra.partner }],
    events: [{ eventId: 'e-uuid', partnerId: 'P', name: 'Event', logos: [], ...extra.event }],
  });
}
const partnerDoc = (data: ReturnType<typeof seed>['data']) => data.partners[0] as Record<string, unknown> & { slots?: Record<string, unknown>; library?: { logos?: string[] } };
const eventDoc = (data: ReturnType<typeof seed>['data']) => data.events[0] as Record<string, unknown> & { slots?: Record<string, unknown>; logos: unknown[] };

test('a slot value is { items, useDefault } and nothing else; repeated ids count once; "use the default" is an empty value', () => {
  assert.deepEqual(parseSlotValue({ items: ['a', 'a', 'b'], useDefault: false }), { ok: true, value: { items: ['a', 'b'], useDefault: false } });
  assert.deepEqual(parseSlotValue({ items: [], useDefault: true }), { ok: true, value: {} });
  assert.deepEqual(parseSlotValue({}), { ok: true, value: {} });
  for (const bad of [null, 'x', [], { items: 'a' }, { items: [1] }, { items: [''] }, { useDefault: 'no' }, { items: ['a'], extra: 1 }]) assert.equal(parseSlotValue(bad).ok, false, JSON.stringify(bad));
});

test('the partner chooses its logo: a global logo is taken into its library in the same step, its own upload is fine, nothing else changes', async () => {
  const { db, data } = seed({ partner: { defaultLogos: [{ logoId: 'g1', scenario: 'onboarding-thankyou', order: 0 }] } });
  const result = await setPartnerLogo(db, partnerDoc(data), { items: ['g2', 'p1'] }, NOW);
  assert.deepEqual(result, { ok: true, value: { items: ['g2', 'p1'] } });
  assert.deepEqual(partnerDoc(data).slots, { logo: { items: ['g2', 'p1'] } });
  assert.ok(partnerDoc(data).library?.logos?.includes('g2'), 'the global logo is in the partner library now');
  assert.deepEqual(partnerDoc(data).defaultLogos, [{ logoId: 'g1', scenario: 'onboarding-thankyou', order: 0 }], 'the old default rows are left as they were');
});

test('the partner cannot choose another partner\'s logo, an event\'s, a switched-off or an unknown one; nothing is stored', async () => {
  const { db, data } = seed();
  for (const [id, status] of [['x1', 400], ['e1', 400], ['g3', 400], ['nope', 404]] as const) {
    const result = await setPartnerLogo(db, partnerDoc(data), { items: [id] }, NOW);
    assert.equal(result.ok, false, id);
    if (!result.ok) assert.equal(result.status, status, id);
  }
  assert.equal(partnerDoc(data).slots, undefined);
});

test('"no logo" is a choice a partner can make: an empty value is stored, so it is on the model and the old rows are not used again', async () => {
  const { db, data } = seed({ partner: { defaultLogos: [{ logoId: 'g1', scenario: 'onboarding-thankyou', order: 0 }] } });
  assert.equal((await setPartnerLogo(db, partnerDoc(data), {}, NOW)).ok, true);
  assert.deepEqual(partnerDoc(data).slots, { logo: {} });
  assert.equal((await loadPartnerLogoPanel(db, partnerDoc(data))).onModel, true);
});

test('the first save of an event that is not on the model seeds its slots from its old list: it keeps showing what it showed, and the old list stays', async () => {
  const oldList = [legacy('g1', 'onboarding-thankyou'), legacy('g1', 'loading-capture'), legacy('g1', 'loading-slideshow'), legacy('g1', 'slideshow-transition')];
  const { db, data } = seed({ event: { logos: oldList, logosOverridden: true } });
  const result = await setEventLogoSlot(db, eventDoc(data), 'logo-capture-loading', { items: ['e1'], useDefault: false }, NOW);
  assert.equal(result.ok && result.value.seeded, true);
  assert.deepEqual(eventDoc(data).slots, { logo: { items: ['g1'], useDefault: false }, 'logo-capture-loading': { items: ['e1'], useDefault: false } });
  assert.deepEqual(eventDoc(data).logos, oldList, 'nothing was deleted or changed');
  const again = await setEventLogoSlot(db, eventDoc(data), 'logo-pages', { items: ['g1'] }, NOW);
  assert.equal(again.ok && again.value.seeded, false, 'not seeded twice');
});

test('"use the default" at an event stores nothing: an event that stored nothing follows its partner', async () => {
  const { db, data } = seed({ event: { slots: { logo: { items: ['g1'] }, 'logo-pages': { items: ['e1'] } } } });
  await setEventLogoSlot(db, eventDoc(data), 'logo-pages', {}, NOW);
  assert.deepEqual(eventDoc(data).slots, { logo: { items: ['g1'] } });
  await setEventLogoSlot(db, eventDoc(data), 'logo', { items: [], useDefault: true }, NOW);
  assert.deepEqual(eventDoc(data).slots, {}, 'on the model, following everything');
});

test('an event takes a logo from its partner\'s library or its own upload, never straight from the global library or from another event', async () => {
  const { db, data } = seed({ event: { slots: {} } });
  assert.equal((await setEventLogoSlot(db, eventDoc(data), 'logo', { items: ['g1', 'e1', 'p1'] }, NOW)).ok, true);
  for (const id of ['g2', 'e2', 'x1', 'g3']) assert.equal((await setEventLogoSlot(db, eventDoc(data), 'logo', { items: [id] }, NOW)).ok, false, id);
  assert.deepEqual(eventDoc(data).slots, { logo: { items: ['g1', 'e1', 'p1'] } }, 'the refused saves stored nothing');
});

test('only the event\'s own slots can be set: an unknown slot is refused', async () => {
  const { db, data } = seed();
  const result = await setEventLogoSlot(db, eventDoc(data), 'frames', { items: ['g1'] }, NOW);
  assert.equal(result.ok, false);
  assert.equal(eventDoc(data).slots, undefined);
});

test('the panels: the event\'s logo shows what it takes from the partner, a place shows what it uses and what it takes from above', async () => {
  const { db, data } = seed({
    partner: { slots: { logo: { items: ['p1'] } } },
    event: { slots: { logo: { items: ['e1'] }, 'logo-capture-loading': { items: ['g1'], useDefault: false } } },
  });
  const panels = await loadEventLogoPanels(db, eventDoc(data));
  assert.equal(panels.onModel, true);
  const byId = Object.fromEntries(panels.slots.map((panel) => [panel.slotId, panel]));
  assert.deepEqual(byId.logo.defaultItems.map((i) => i.id), ['p1']);
  assert.deepEqual(byId.logo.ownItems.map((i) => i.id), ['e1']);
  assert.deepEqual(byId.logo.effective.map((i) => `${i.level}:${i.id}`), ['event:e1', 'partner:p1']);
  assert.equal(byId.logo.mode, 'add');
  assert.deepEqual(byId['logo-pages'].effective.map((i) => i.id), ['e1', 'p1']);
  assert.equal(byId['logo-pages'].mode, 'default');
  assert.deepEqual(byId['logo-pages'].defaultItems.map((i) => i.id), ['e1', 'p1'], 'a place takes the event\'s logo, which takes the partner\'s');
  assert.deepEqual(byId['logo-capture-loading'].effective.map((i) => i.id), ['g1']);
  assert.equal(byId['logo-capture-loading'].mode, 'replace');
  assert.ok(panels.candidates.some((c) => c.id === 'g1') && panels.candidates.some((c) => c.id === 'e1') && !panels.candidates.some((c) => c.id === 'g2'));
});

test('an event not on the model shows in the panels exactly what its old list shows, without being changed', async () => {
  const { db, data } = seed({ event: { logos: [legacy('g1', 'onboarding-thankyou'), legacy('e1', 'loading-capture')], logosOverridden: true } });
  const before = structuredClone(eventDoc(data));
  const panels = await loadEventLogoPanels(db, eventDoc(data));
  assert.equal(panels.onModel, false);
  const byId = Object.fromEntries(panels.slots.map((panel) => [panel.slotId, panel]));
  assert.deepEqual(byId['logo-pages'].effective.map((i) => i.id), ['g1']);
  assert.deepEqual(byId['logo-capture-loading'].effective.map((i) => i.id), ['e1']);
  assert.deepEqual(byId['logo-slideshow-loading'].effective, []);
  assert.deepEqual(eventDoc(data), before, 'reading changes nothing');
});

test('who uses a logo includes the slot model: events and partners that chose it count, so it cannot be deleted from under them', async () => {
  const { db } = seed({ partner: { slots: { logo: { items: ['p1'] } } }, event: { slots: { 'logo-pages': { items: ['p1'] } } } });
  const usage = await usageOfItem(db, 'logos', 'p1');
  assert.equal(usage.events, 1);
  assert.equal(usage.partnerDefaults, 1);
  const none = await usageOfItem(db, 'logos', 'g2');
  assert.deepEqual(none, { events: 0, partnerLibraries: 0, partnerDefaults: 0 });
});

test('deleting an event\'s own upload takes it out of its slots; a partner\'s own upload cannot be deleted while an event holds it in a slot', async () => {
  const a = seed({ event: { slots: { logo: { items: ['e1', 'g1'] }, 'logo-pages': { items: ['e1'] } } } });
  assert.deepEqual(await deleteLibraryUpload(a.db, 'logos', 'e1', { scope: 'event', eventId: 'e-uuid' }), { ok: true });
  assert.deepEqual(eventDoc(a.data).slots, { logo: { items: ['g1'] }, 'logo-pages': { items: [] } });

  const b = seed({ event: { slots: { logo: { items: ['p1'] } } } });
  const refused = await deleteLibraryUpload(b.db, 'logos', 'p1', { scope: 'partner', partnerId: 'P' });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.status, 409);
});

test('saving a slot also refreshes the event\'s snapshot of what each place uses, and a logo that is lost later is still in it', async () => {
  const { db, data } = seed({ partner: { slots: { logo: { items: ['p1'] } } }, event: { slots: {} } });
  await setEventLogoSlot(db, eventDoc(data), 'logo', { items: ['e1'] }, NOW);
  const snapshots = (eventDoc(data) as unknown as { slotSnapshots: Record<string, Array<{ id: string; name: string }>> }).slotSnapshots;
  assert.deepEqual(snapshots['logo-pages'].map((i) => i.id), ['e1', 'p1']);
  assert.equal(snapshots['logo-pages'][1].name, 'Logo p1');

  // the partner's logo is deleted from the library: the next save keeps what the event had, in the snapshot
  data.logos.splice(data.logos.findIndex((l) => l.logoId === 'p1'), 1);
  await setEventLogoSlot(db, eventDoc(data), 'logo-pages', { items: ['e1'] }, NOW);
  const after = (eventDoc(data) as unknown as { slotSnapshots: Record<string, Array<{ id: string }>> }).slotSnapshots;
  assert.ok(after['logo-pages'].some((i) => i.id === 'p1'), 'the lost logo is still known to the event');
});

test('the panels show a logo the library lost from the event\'s snapshot, marked lost, instead of dropping it', async () => {
  const { db, data } = seed({ partner: { slots: { logo: { items: ['p1'] } } }, event: { slots: {} } });
  await setEventLogoSlot(db, eventDoc(data), 'logo', { items: ['e1'] }, NOW);
  data.logos.splice(data.logos.findIndex((l) => l.logoId === 'e1'), 1);
  const panels = await loadEventLogoPanels(db, eventDoc(data));
  const place = panels.slots.find((s) => s.slotId === 'logo-pages');
  const lost = place?.effective.find((i) => i.id === 'e1');
  assert.ok(lost, 'the lost logo is still listed');
  assert.equal(lost?.lost, true);
  assert.equal(lost?.name, 'Logo e1');
  assert.equal(lost?.imageUrl, 'https://img.example/e1.png');
  assert.ok(panels.slots.find((s) => s.slotId === 'logo')?.ownItems.some((i) => i.id === 'e1' && i.lost), 'it is one of the event\'s own choices');
  assert.ok(!place?.effective.find((i) => i.id === 'p1')?.lost, 'a logo the library has is not marked');
});

test('"Keep as own": a logo the event chose and the library lost becomes the event\'s own logo, in the same place and position, in every place that used it', async () => {
  const { db, data } = seed({ partner: { slots: { logo: { items: ['p1'] } } }, event: { slots: {} } });
  await setEventLogoSlot(db, eventDoc(data), 'logo', { items: ['e1'] }, NOW);
  await setEventLogoSlot(db, eventDoc(data), 'logo-pages', { items: ['g1', 'e1'], useDefault: false }, NOW);
  data.logos.splice(data.logos.findIndex((l) => l.logoId === 'e1'), 1);

  const result = await keepLostLogoAsOwn(db, eventDoc(data), 'e1', NOW);
  assert.ok(result.ok);
  if (!result.ok) return;
  const kept = data.logos.find((l) => l.logoId === result.value.logoId) as Record<string, unknown>;
  assert.equal(kept.scope, 'event');
  assert.equal(kept.eventId, 'e-uuid');
  assert.equal(kept.imageUrl, 'https://img.example/e1.png', 'the picture address of the snapshot is used as it is');
  assert.equal(kept.name, 'Logo e1');
  assert.deepEqual([...result.value.places].sort(), ['logo', 'logo-pages']);
  const slots = (eventDoc(data) as unknown as { slots: Record<string, { items: string[]; useDefault?: boolean }> }).slots;
  assert.deepEqual(slots['logo'].items, [result.value.logoId]);
  assert.deepEqual(slots['logo-pages'], { items: ['g1', result.value.logoId], useDefault: false }, 'the position and the rest of the choice are kept');

  const panels = await loadEventLogoPanels(db, eventDoc(data));
  const place = panels.slots.find((s) => s.slotId === 'logo-pages');
  assert.ok(place?.effective.every((i) => !i.lost), 'nothing is lost any more');
});

test('"Keep as own" refuses what it should: a logo still in the library, one the event did not choose itself, one it has no record of, an event not on the model', async () => {
  const { db, data } = seed({ partner: { slots: { logo: { items: ['p1'] } } }, event: { slots: {} } });
  await setEventLogoSlot(db, eventDoc(data), 'logo', { items: ['e1'] }, NOW);
  assert.equal((await keepLostLogoAsOwn(db, eventDoc(data), 'e1', NOW)).ok, false, 'still in the library');
  assert.equal((await keepLostLogoAsOwn(db, eventDoc(data), 'nope', NOW)).ok, false, 'no record');
  // the partner's logo is lost: it is the partner's default, not the event's own choice
  data.logos.splice(data.logos.findIndex((l) => l.logoId === 'p1'), 1);
  const lostDefault = await keepLostLogoAsOwn(db, eventDoc(data), 'p1', NOW);
  assert.ok(!lostDefault.ok && lostDefault.status === 400 && /did not choose/.test(lostDefault.reason));
  const legacyEvent = seed();
  assert.equal((await keepLostLogoAsOwn(legacyEvent.db, eventDoc(legacyEvent.data), 'e1', NOW)).ok, false, 'an event not on the model has nothing lost');
  assert.equal(data.logos.filter((l) => (l as { createdBy?: string }).createdBy === 'system').length, 0, 'nothing was created');
});
