import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId, type Db } from 'mongodb';
import { refreshFrameDesign, saveFrameMessages, type RefreshDeps } from './sync';
import { DEFAULT_FRAME_MESSAGES } from './messages';
import type { FrameDesign } from './context';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_DEFAULT_CTA_BRAND_COLOR, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';

const NOW = '2026-10-06T12:00:00.000Z';
// Colours from the token file (no raw colour literals in tests), as #RRGGBBAA.
const WHITE = `${CAMERA_STAGE_WHITE}FF`;
const HERO = `${CAMERA_DEFAULT_CTA_BRAND_COLOR}FF`;
const OTHER_HERO = `${CAMERA_DEFAULT_BRAND_COLOR}FF`;
const eventId = new ObjectId();

function fakeDb(partner: Record<string, unknown> | null = { name: 'Fan Club', logoUrl: 'https://i.ibb.co/fc.png' }) {
  const updates: Array<{ collection: string; filter: unknown; update: { $set: Record<string, unknown> } }> = [];
  const db = {
    collection: (collection: string) => ({
      findOne: async () => (collection === 'partners' ? partner : null),
      updateOne: async (filter: unknown, update: { $set: Record<string, unknown> }) => {
        updates.push({ collection, filter, update });
        return { matchedCount: 1 };
      },
    }),
  } as unknown as Db;
  return { db, updates };
}

function answer(heroBackground = HERO) {
  return {
    event: { name: 'El Clásico', homeTeam: { id: 'h', name: 'FC Barcelona' }, visitorTeam: { id: 'v', name: 'Real Madrid' } },
    partner: { name: 'FC Barcelona', logoUrl: 'https://i.ibb.co/home.png' },
    template: { name: 'T', resolvedFrom: 'default' },
    style: { name: 'S', resolvedFrom: 'partner', fontFamily: 'Inter', fontSource: 'google', fontFile: null, headingColor: WHITE, heroBackground },
  };
}

function deps(raw: unknown, configured = true) {
  const calls: string[] = [];
  const d: RefreshDeps = {
    fetchContext: async (id) => (calls.push(id), raw),
    messmassConfigured: () => configured,
    now: () => NOW,
  };
  return { d, calls };
}

const linked = (extra: Record<string, unknown> = {}) => ({ _id: eventId, name: 'El Clásico', partnerId: 'p1', partnerName: 'Fan Club', messmassEventId: 'm'.repeat(24), ...extra });

test('a linked event gets a messmass snapshot and the default message list', async () => {
  const { db, updates } = fakeDb();
  const { d, calls } = deps(answer());
  const result = await refreshFrameDesign(db, linked(), d);

  assert.deepEqual(calls, ['m'.repeat(24)]);
  assert.equal(result.changed, true);
  assert.equal(result.messmassUnavailable, false);
  assert.equal(result.design.context.source, 'messmass');
  assert.deepEqual(result.design.messages, [...DEFAULT_FRAME_MESSAGES]);
  assert.equal(result.design.messagesOverridden, false);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].collection, 'events');
  assert.deepEqual(updates[0].update.$set.frameDesign, result.design);
});

test('a refresh with the same answer is not a change, one with a new colour is', async () => {
  const { db } = fakeDb();
  const first = (await refreshFrameDesign(db, linked(), deps(answer()).d)).design;

  const same = await refreshFrameDesign(db, linked({ frameDesign: first }), deps(answer()).d);
  assert.equal(same.changed, false);

  const colour = await refreshFrameDesign(db, linked({ frameDesign: first }), deps(answer(OTHER_HERO)).d);
  assert.equal(colour.changed, true);
  assert.notEqual(colour.design.context.inputHash, first.context.inputHash);
});

test('an edited message list survives a refresh; the default list follows the code until it is edited', async () => {
  const { db } = fakeDb();
  const base = (await refreshFrameDesign(db, linked(), deps(answer()).d)).design;

  const edited: FrameDesign = { ...base, messages: ['Hup Holland'], messagesOverridden: true };
  assert.deepEqual((await refreshFrameDesign(db, linked({ frameDesign: edited }), deps(answer()).d)).design.messages, ['Hup Holland']);

  const stale: FrameDesign = { ...base, messages: ['an old default'], messagesOverridden: false };
  assert.deepEqual((await refreshFrameDesign(db, linked({ frameDesign: stale }), deps(answer()).d)).design.messages, [...DEFAULT_FRAME_MESSAGES]);
});

test('when messmass gives nothing usable the previous snapshot is kept and nothing is written', async () => {
  const { db, updates } = fakeDb();
  const first = (await refreshFrameDesign(db, linked(), deps(answer()).d)).design;
  updates.length = 0;

  for (const raw of [null, { success: true }, 'garbage']) {
    const result = await refreshFrameDesign(db, linked({ frameDesign: first }), deps(raw).d);
    assert.equal(result.messmassUnavailable, true);
    assert.equal(result.changed, false);
    assert.equal(result.design, first);
  }
  assert.equal(updates.length, 0);
});

test('a linked event with no snapshot yet and no answer from messmass gets the fallback, and says so', async () => {
  const { db, updates } = fakeDb();
  const result = await refreshFrameDesign(db, linked(), deps(null).d);
  assert.equal(result.messmassUnavailable, true);
  assert.equal(result.changed, true);
  assert.equal(result.design.context.source, 'camera');
  assert.deepEqual(result.design.context.partner, { name: 'Fan Club', logoUrl: 'https://i.ibb.co/fc.png' });
  assert.equal(updates.length, 1);
});

test('an event without a messmass link, or with messmass not configured, never calls messmass', async () => {
  const { db } = fakeDb();
  const notLinked = deps(answer());
  const a = await refreshFrameDesign(db, linked({ messmassEventId: undefined }), notLinked.d);
  assert.deepEqual(notLinked.calls, []);
  assert.equal(a.design.context.source, 'camera');
  assert.equal(a.messmassUnavailable, false);

  const notConfigured = deps(answer(), false);
  const b = await refreshFrameDesign(db, linked(), notConfigured.d);
  assert.deepEqual(notConfigured.calls, []);
  assert.equal(b.messmassUnavailable, false);
});

test('saving messages: an edited list counts as overridden, the default list does not, reset restores it', async () => {
  const { db, updates } = fakeDb();
  const base = (await refreshFrameDesign(db, linked(), deps(answer()).d)).design;
  const event = linked({ frameDesign: base });
  updates.length = 0;

  const edited = await saveFrameMessages(db, event, { messages: ['  Go!  ', 'Let’s Go, {partner1}'] }, deps(null).d);
  assert.deepEqual(edited.messages, ['Go!', 'Let’s Go, {partner1}']);
  assert.equal(edited.messagesOverridden, true);
  assert.deepEqual(updates[0].update.$set['frameDesign.messages'], ['Go!', 'Let’s Go, {partner1}']);

  const sameAsDefault = await saveFrameMessages(db, event, { messages: [...DEFAULT_FRAME_MESSAGES] }, deps(null).d);
  assert.equal(sameAsDefault.messagesOverridden, false);

  const reset = await saveFrameMessages(db, linked({ frameDesign: edited }), { reset: true }, deps(null).d);
  assert.deepEqual(reset.messages, [...DEFAULT_FRAME_MESSAGES]);
  assert.equal(reset.messagesOverridden, false);
});

test('a list the editor may not save is a 400 and nothing is written', async () => {
  const { db, updates } = fakeDb();
  const base = (await refreshFrameDesign(db, linked(), deps(answer()).d)).design;
  updates.length = 0;

  for (const messages of [Array.from({ length: 11 }, () => 'Go!'), ['ok', ''], ['Hi {coach}'], 'Go!']) {
    const error = await saveFrameMessages(db, linked({ frameDesign: base }), { messages }, deps(null).d).then(() => null, (e: unknown) => e);
    assert.ok(error instanceof Response && error.status === 400, JSON.stringify(messages));
  }
  assert.equal(updates.length, 0);
});

test('saving messages on an event with no snapshot yet creates the snapshot first', async () => {
  const { db, updates } = fakeDb();
  const design = await saveFrameMessages(db, linked(), { messages: ['Go!'] }, deps(answer()).d);
  assert.equal(design.context.source, 'messmass');
  assert.deepEqual(design.messages, ['Go!']);
  assert.equal(updates.length, 2);
});
