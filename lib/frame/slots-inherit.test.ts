import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { effectiveSlots, followersOf, getGlobalSlots, loadInheritedSlots, partnerSlotsOf, saveGlobalSlots, savePartnerSlots, slotsOrDefault } from './slots-inherit';
import { DEFAULT_SLOTS, type FrameSlots } from './slots';

const own: FrameSlots = { text: { 'top-left': { source: 'custom', text: 'Event' } }, picture: {} };
const partnerSlots: FrameSlots = { text: { 'top-left': { source: 'custom', text: 'Partner' } }, picture: {} };
const globalSlots: FrameSlots = { text: { 'top-left': { source: 'custom', text: 'General' } }, picture: {} };

interface Calls { updates: Array<{ collection: string; filter: unknown; update: unknown; options: unknown }>; finds: Array<{ collection: string; filter: Record<string, unknown> }> }

function world(data: { partner?: Record<string, unknown> | null; setting?: Record<string, unknown> | null; events?: Array<Record<string, unknown>>; partnersWithDefault?: Array<Record<string, unknown>> }) {
  const calls: Calls = { updates: [], finds: [] };
  const db = {
    collection: (name: string) => ({
      findOne: async () => (name === 'partners' ? (data.partner ?? null) : name === 'admin_settings' ? (data.setting ?? null) : null),
      updateOne: async (filter: unknown, update: unknown, options: unknown) => (calls.updates.push({ collection: name, filter, update, options }), { matchedCount: 1 }),
      find: (filter: Record<string, unknown>) => {
        calls.finds.push({ collection: name, filter });
        const rows = name === 'partners' ? (data.partnersWithDefault ?? []) : (data.events ?? []);
        const chain = { project: () => chain, sort: () => chain, toArray: async () => rows };
        return chain;
      },
    }),
  } as unknown as Db;
  return { db, calls };
}

test('what an event follows: the partner\'s default, else the general one, else the built-in default frame', async () => {
  const event = { partnerId: 'p1' };
  assert.deepEqual(await loadInheritedSlots(world({ partner: { defaultFrameSlots: partnerSlots }, setting: { slots: globalSlots } }).db, event), { slots: partnerSlots, source: 'partner' });
  assert.deepEqual(await loadInheritedSlots(world({ partner: {}, setting: { slots: globalSlots } }).db, event), { slots: globalSlots, source: 'global' });
  assert.deepEqual(await loadInheritedSlots(world({ partner: {}, setting: null }).db, event), { slots: undefined, source: 'built-in' });
  assert.deepEqual(await loadInheritedSlots(world({ setting: { slots: globalSlots } }).db, {}), { slots: globalSlots, source: 'global' }, 'an event with no partner');
});

test('the event\'s own slots come first; stored slots that are not valid count as none', async () => {
  const w = world({ partner: { defaultFrameSlots: partnerSlots } });
  assert.deepEqual(await effectiveSlots(w.db, { partnerId: 'p1', frameDesign: { slots: own } }), { slots: own, source: 'event' });
  assert.deepEqual(await effectiveSlots(w.db, { partnerId: 'p1', frameDesign: {} }), { slots: partnerSlots, source: 'partner' });
  const broken = world({ partner: { defaultFrameSlots: { text: { nowhere: { source: 'teams' } } } }, setting: { slots: { picture: { 'top-left': { source: 'bar' } } } } });
  assert.deepEqual(await effectiveSlots(broken.db, { partnerId: 'p1' }), { slots: undefined, source: 'built-in' });
  assert.equal(partnerSlotsOf({ defaultFrameSlots: 'x' }), undefined);
  assert.equal(await getGlobalSlots(world({ setting: { slots: globalSlots } }).db) !== undefined, true);
  assert.equal(slotsOrDefault(undefined), DEFAULT_SLOTS);
  assert.equal(slotsOrDefault(own), own);
});

test('a default is saved or taken away on the partner and in the general settings, nothing else is written', async () => {
  const a = world({});
  await savePartnerSlots(a.db, 'p1', partnerSlots, 'now');
  assert.deepEqual(a.calls.updates[0].update, { $set: { defaultFrameSlots: partnerSlots, updatedAt: 'now' } });
  await savePartnerSlots(a.db, 'p1', undefined, 'now');
  assert.deepEqual(a.calls.updates[1].update, { $set: { updatedAt: 'now' }, $unset: { defaultFrameSlots: '' } });
  await saveGlobalSlots(a.db, globalSlots, 'a@x.test', 'now');
  assert.deepEqual(a.calls.updates[2].filter, { settingId: 'frame-slots-default' });
  assert.deepEqual((a.calls.updates[2].update as { $set: Record<string, unknown> }).$set.slots, globalSlots);
  assert.deepEqual(a.calls.updates[2].options, { upsert: true });
  await saveGlobalSlots(a.db, undefined, null, 'now');
  assert.deepEqual((a.calls.updates[3].update as { $unset: unknown }).$unset, { slots: '' });
});

test('the followers of a partner\'s default are its events with images and no slots of their own; of the general default, those whose partner has no default of its own', async () => {
  const events = [{ _id: new ObjectId(), eventId: 'e1', name: 'MTK x Vasas' }];
  const partnerLevel = world({ events });
  const followers = await followersOf(partnerLevel.db, { partnerId: 'p1' });
  assert.deepEqual(followers.map((f) => [f.eventId, f.name]), [['e1', 'MTK x Vasas']]);
  assert.deepEqual(partnerLevel.calls.finds[0].filter, { 'frameDesign.variants.0': { $exists: true }, 'frameDesign.slots': { $exists: false }, partnerId: 'p1' });
  const general = world({ events, partnersWithDefault: [{ partnerId: 'p9' }, { partnerId: 'p8' }] });
  await followersOf(general.db, 'global');
  assert.deepEqual(general.calls.finds[1].filter, { 'frameDesign.variants.0': { $exists: true }, 'frameDesign.slots': { $exists: false }, partnerId: { $nin: ['p9', 'p8'] } });
  const noPartnerDefaults = world({ events });
  await followersOf(noPartnerDefaults.db, 'global');
  assert.equal('partnerId' in noPartnerDefaults.calls.finds[1].filter, false);
});
