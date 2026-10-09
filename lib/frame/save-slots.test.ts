import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { contextHash, nativeFrameContext, type FrameDesign } from './context';
import { saveFrameSlots, withoutGoneMessages } from './save-slots';
import { DEFAULT_SLOTS, type FrameSlots } from './slots';

const NOW = '2026-10-09T12:00:00.000Z';
const BLOB = 'https://abc123.public.blob.vercel-storage.com/frames';
const base = nativeFrameContext({ eventName: 'MTK x Vasas' }, NOW);
const design = (extra: Partial<FrameDesign> = {}): FrameDesign => ({ context: { ...base, inputHash: contextHash(base) }, messages: ['HAJRÁ, MTK!', 'MTK SZÍV!'], messagesOverridden: true, updatedAt: NOW, ...extra });

function world(frameDesign: FrameDesign | undefined, partner: Record<string, unknown> | null = null) {
  const updates: Array<{ filter: unknown; update: Record<string, Record<string, unknown>> }> = [];
  const db = { collection: (name: string) => ({ findOne: async () => (name === 'partners' ? partner : null), updateOne: async (filter: unknown, update: Record<string, Record<string, unknown>>) => (updates.push({ filter, update }), { matchedCount: 1 }) }) } as unknown as Db;
  const event = { _id: new ObjectId(), eventId: 'e1', name: 'MTK x Vasas', partnerId: 'p1', ...(frameDesign ? { frameDesign } : {}) };
  return { db, event, updates };
}
const deps = { fetchContext: async () => null, messmassConfigured: () => false, now: () => NOW };

const strips: FrameSlots = {
  text: { 'bottom-center': { source: 'message' } },
  picture: { 'bottom-center': { source: 'picture', images: [{ key: 'blue', imageUrl: `${BLOB}/b.png` }, { key: 'pink', imageUrl: `${BLOB}/p.png` }], byMessage: { 'MTK SZÍV!': 'pink', 'Removed message': 'pink' } } },
};

test('slots are saved on the design, and a mapping for a message that is gone is dropped', async () => {
  const { db, event, updates } = world(design());
  const saved = await saveFrameSlots(db, event, { slots: strips }, deps);
  assert.deepEqual(saved.slots?.picture['bottom-center']?.byMessage, { 'MTK SZÍV!': 'pink' });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].update.$set['frameDesign.slots'], saved.slots);
  assert.equal(updates[0].update.$unset, undefined);
  assert.equal(saved.messages.length, 2, 'the rest of the design stays');
});

test('slots equal to the default frame, or a reset, give the event the default frame again', async () => {
  for (const input of [{ slots: JSON.parse(JSON.stringify(DEFAULT_SLOTS)) }, { reset: true }]) {
    const { db, event, updates } = world(design({ slots: strips }));
    const saved = await saveFrameSlots(db, event, input, deps);
    assert.equal(saved.slots, undefined);
    assert.deepEqual(updates[0].update.$unset, { 'frameDesign.slots': '' });
  }
});

test('slots that may not be saved are a 400 with the reason, and nothing is written', async () => {
  const { db, event, updates } = world(design());
  const refused = async (input: unknown) => {
    try {
      await saveFrameSlots(db, event, { slots: input }, deps);
    } catch (error) {
      return { status: (error as Response).status, body: await (error as Response).text() };
    }
    return null;
  };
  const own = await refused({ picture: { 'top-left': { source: 'picture', images: [{ key: 'a', imageUrl: 'https://evil.test/a.png' }] } } });
  assert.equal(own?.status, 400);
  assert.match(own?.body ?? '', /own storage/);
  assert.equal((await refused('nope'))?.status, 400);
  assert.equal(updates.length, 0);
});

test('an event with no snapshot yet gets one first (the fallback made from its own data)', async () => {
  const { db, event, updates } = world(undefined);
  const saved = await saveFrameSlots(db, event, { slots: { text: { 'top-left': { source: 'custom', text: 'Hello' } }, picture: {} } }, deps);
  assert.equal(saved.context.source, 'camera');
  assert.ok(updates.some((u) => u.update.$set['frameDesign.slots']));
});

test('withoutGoneMessages keeps a slot with no map as it is', () => {
  const slots: FrameSlots = { text: {}, picture: { 'top-right': { source: 'partnerLogo' } } };
  assert.deepEqual(withoutGoneMessages(slots, ['x']), slots);
});

test('slots that are what the event follows are stored as none: the partner\'s default, not only the built-in default frame', async () => {
  const partnerDefault: FrameSlots = { text: { 'top-left': { source: 'custom', text: 'Partner' } }, picture: {} };
  const { db, event, updates } = world(design(), { defaultFrameSlots: partnerDefault });
  const same = await saveFrameSlots(db, event, { slots: partnerDefault }, deps);
  assert.equal(same.slots, undefined, 'the event keeps following');
  assert.deepEqual(updates[0].update.$unset, { 'frameDesign.slots': '' });
  // the built-in default frame is now a choice of its own: the event no longer follows the partner
  const explicit = await saveFrameSlots(db, event, { slots: JSON.parse(JSON.stringify(DEFAULT_SLOTS)) }, deps);
  assert.deepEqual(explicit.slots, DEFAULT_SLOTS);
  assert.deepEqual(updates[1].update.$set['frameDesign.slots'], DEFAULT_SLOTS);
});
