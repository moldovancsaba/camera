import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import { addStadiumToEventSlot, addStadiumToPartnerSlot, globalStadiumIds, listStadiumBackgrounds, loadEventStadiumPanel, loadPartnerStadiumPanel, resolveEventStadiumDocs, setEventStadium, setPartnerStadium } from './stadium-store';
import { listSampleSelfies } from './selfie-store';

const NOW = '2026-10-10T12:00:00.000Z';
const img = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: pictureId, imageUrl: `https://store.public.blob.vercel-storage.com/${pictureId}.png`, thumbnailUrl: `https://store.public.blob.vercel-storage.com/${pictureId}.png`, isActive: true, tags: ['stadium-background'], createdAt: `2026-10-0${pictureId.length}T00:00:00.000Z`, ...extra });
const world = () =>
  fakeDb({
    [COLLECTIONS.IMAGES]: [
      img('g1', { scope: 'global' }),
      img('g2', { scope: 'global' }),
      img('gOff', { scope: 'global', isActive: false }),
      img('gPlain', { scope: 'global', tags: undefined }),
      img('p1', { scope: 'partner', partnerId: 'P' }),
      img('pOther', { scope: 'partner', partnerId: 'Q' }),
      img('e1', { scope: 'event', eventId: 'E', partnerId: 'P' }),
      img('eOther', { scope: 'event', eventId: 'F', partnerId: 'P' }),
    ],
    [COLLECTIONS.PARTNERS]: [{ partnerId: 'P', name: 'MTK' }],
    [COLLECTIONS.EVENTS]: [{ eventId: 'E', partnerId: 'P', name: 'Match', slots: {} }],
  });
const partner = (w: ReturnType<typeof world>) => w.data[COLLECTIONS.PARTNERS][0];
const event = (w: ReturnType<typeof world>) => w.data[COLLECTIONS.EVENTS][0];
const slot = (doc: Record<string, unknown>) => (doc.slots as Record<string, unknown> | undefined)?.stadium;

test('the global default set is the active global stadium backgrounds only: not switched off, not untagged, not a partner or event upload', async () => {
  const w = world();
  assert.deepEqual((await globalStadiumIds(w.db)).sort(), ['g1', 'g2']);
  assert.deepEqual((await listStadiumBackgrounds(w.db)).map((item) => item.id).sort(), ['g1', 'g2', 'gOff'], 'the admin list shows the switched off one too');
});

test('a partner chooses a global one or its own upload; another partner’s, an event’s, an untagged, a switched off or an unknown one is refused; using the default stores nothing', async () => {
  const w = world();
  assert.equal((await setPartnerStadium(w.db, partner(w), { items: ['g1', 'p1'] }, NOW)).ok, true);
  assert.deepEqual(slot(partner(w)), { items: ['g1', 'p1'] });
  for (const bad of ['pOther', 'e1', 'gPlain', 'gOff', 'nope']) {
    const result = await setPartnerStadium(w.db, partner(w), { items: [bad] }, NOW);
    assert.equal(result.ok, false, bad);
  }
  assert.deepEqual(slot(partner(w)), { items: ['g1', 'p1'] }, 'a refused value writes nothing');
  assert.equal((await setPartnerStadium(w.db, partner(w), { items: ['p1'], useDefault: false }, NOW)).ok, true);
  assert.deepEqual(slot(partner(w)), { items: ['p1'], useDefault: false });
  assert.equal((await setPartnerStadium(w.db, partner(w), {}, NOW)).ok, true);
  assert.equal(slot(partner(w)), undefined, 'use the default: nothing stored');
  assert.equal((await setPartnerStadium(w.db, partner(w), { items: 'x' }, NOW)).ok, false);
});

test('an event chooses what its partner uses, its partner’s uploads or its own; a global one the partner replaced away, another event’s upload or a switched off one is refused', async () => {
  const w = world();
  assert.equal((await setEventStadium(w.db, event(w), { items: ['g2', 'p1', 'e1'] }, NOW)).ok, true);
  assert.deepEqual(slot(event(w)), { items: ['g2', 'p1', 'e1'] });
  assert.equal((await setPartnerStadium(w.db, partner(w), { items: ['p1'], useDefault: false }, NOW)).ok, true);
  const refused = await setEventStadium(w.db, event(w), { items: ['g1'] }, NOW);
  assert.equal(refused.ok, false, 'the partner replaced the global set: its events cannot take a global one the partner does not have');
  for (const bad of ['eOther', 'gOff', 'pOther']) assert.equal((await setEventStadium(w.db, event(w), { items: [bad] }, NOW)).ok, false, bad);
  assert.equal((await setEventStadium(w.db, event(w), {}, NOW)).ok, true);
  assert.equal(slot(event(w)), undefined);
});

test('an event that is not on the slot model is put on it, seeded from its old logo list, so writing the selfie never switches its logos unseeded', async () => {
  const w = fakeDb({
    [COLLECTIONS.IMAGES]: [img('g1', { scope: 'global' })],
    [COLLECTIONS.PARTNERS]: [{ partnerId: 'P', name: 'MTK' }],
    [COLLECTIONS.EVENTS]: [{ eventId: 'E', partnerId: 'P', name: 'Old', logos: [], logosOverridden: false }],
  });
  const result = await setEventStadium(w.db, w.data[COLLECTIONS.EVENTS][0], { items: ['g1'] }, NOW);
  assert.equal(result.ok && result.value.seeded, true);
  const slots = w.data[COLLECTIONS.EVENTS][0].slots as Record<string, unknown>;
  assert.deepEqual(slots.stadium, { items: ['g1'] });
  assert.ok(!('logo' in slots), 'an event that followed its partner for logos still follows (nothing stored for the logo)');
});

test('an upload joins the slot, keeping the default in use unless the level already replaced it', async () => {
  const w = world();
  assert.equal((await addStadiumToPartnerSlot(w.db, partner(w), 'p1', NOW)).ok, true);
  assert.deepEqual(slot(partner(w)), { items: ['p1'] });
  assert.equal((await setPartnerStadium(w.db, partner(w), { items: ['p1'], useDefault: false }, NOW)).ok, true);
  assert.equal((await addStadiumToEventSlot(w.db, event(w), 'e1', NOW)).ok, true);
  assert.deepEqual(slot(event(w)), { items: ['e1'] });
});

test('the panels say what is used, from where, and what can be picked; the event uses what is resolved, in order', async () => {
  const w = world();
  const partnerPanel = await loadPartnerStadiumPanel(w.db, partner(w));
  assert.deepEqual(partnerPanel.effective.map((item) => [item.id, item.level]).sort(), [['g1', 'global'], ['g2', 'global']]);
  assert.equal(partnerPanel.mode, 'default');
  assert.deepEqual(partnerPanel.candidates.map((item) => item.id).sort(), ['g1', 'g2', 'p1']);
  await setEventStadium(w.db, event(w), { items: ['e1'] }, NOW);
  const eventPanel = await loadEventStadiumPanel(w.db, event(w));
  assert.deepEqual(eventPanel.effective.map((item) => item.id), ['e1', 'g1', 'g2'].sort((a, b) => (a === 'e1' ? -1 : b === 'e1' ? 1 : 0)).slice(0, 3));
  assert.equal(eventPanel.mode, 'add');
  assert.deepEqual(eventPanel.defaultItems.map((item) => item.id).sort(), ['g1', 'g2']);
  assert.equal(eventPanel.parentName, 'the partner');
  assert.deepEqual((await resolveEventStadiumDocs(w.db, event(w))).map((doc) => doc.pictureId)[0], 'e1');
});

test('a switched off or deleted stadium background drops out of what is used, and with none left nothing is used (the built-in stage is drawn)', async () => {
  const w = world();
  await setEventStadium(w.db, event(w), { items: ['e1'], useDefault: false }, NOW);
  w.data[COLLECTIONS.IMAGES].find((doc) => doc.pictureId === 'e1')!.isActive = false;
  assert.deepEqual(await resolveEventStadiumDocs(w.db, event(w)), []);
  w.data[COLLECTIONS.IMAGES] = w.data[COLLECTIONS.IMAGES].filter((doc) => doc.pictureId !== 'e1');
  assert.deepEqual(await resolveEventStadiumDocs(w.db, event(w)), []);
});

test('the stadium backgrounds and the sample selfies are two lists: a picture with one tag is never in the other', async () => {
  const w = fakeDb({
    [COLLECTIONS.IMAGES]: [img('bg1', { scope: 'global' }), img('self1', { scope: 'global', tags: ['sample-selfie'] }), img('plain', { scope: 'global', tags: undefined })],
    [COLLECTIONS.PARTNERS]: [{ partnerId: 'P', name: 'MTK' }],
    [COLLECTIONS.EVENTS]: [{ eventId: 'E', partnerId: 'P', name: 'Match', slots: {} }],
  });
  assert.deepEqual((await globalStadiumIds(w.db)), ['bg1']);
  assert.deepEqual((await listStadiumBackgrounds(w.db)).map((item) => item.id), ['bg1']);
  assert.deepEqual((await listSampleSelfies(w.db)).map((item) => item.id), ['self1']);
  const refused = await setPartnerStadium(w.db, w.data[COLLECTIONS.PARTNERS][0], { items: ['self1'] }, NOW);
  assert.equal(refused.ok, false, 'a sample selfie cannot be chosen as a stadium background');
  assert.deepEqual((await resolveEventStadiumDocs(w.db, w.data[COLLECTIONS.EVENTS][0])).map((doc) => doc.pictureId), ['bg1']);
});
