import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { defaultSlotsView, previewDefaultSlots, redrawFollower, runDefaultSlotsAction, saveDefaultSlots } from './default-slots';
import { DEFAULT_SLOTS, type FrameSlots } from './slots';

const slots: FrameSlots = { text: { 'top-left': { source: 'custom', text: 'Hello' } }, picture: {} };
const eventId = new ObjectId();

function world(options: { sample?: Record<string, unknown> | null; followers?: Array<Record<string, unknown>>; setting?: Record<string, unknown> | null; matched?: number } = {}) {
  const updates: Array<{ collection: string; update: unknown }> = [];
  const db = {
    collection: (name: string) => ({
      findOne: async (filter: Record<string, unknown>) => (name === 'events' ? ('_id' in filter ? (options.followers?.[0] ?? null) : (options.sample ?? null)) : name === 'admin_settings' ? (options.setting ?? null) : null),
      updateOne: async (_f: unknown, update: unknown) => (updates.push({ collection: name, update }), { matchedCount: options.matched ?? 1 }),
      find: () => {
        const chain = { project: () => chain, sort: () => chain, toArray: async () => (name === 'events' ? (options.followers ?? []) : []) };
        return chain;
      },
    }),
  } as unknown as Db;
  return { db, updates };
}
const refused = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as Response;
  }
  return null;
};

test('saving a default stores it on its level and says which events follow', async () => {
  const w = world({ followers: [{ _id: eventId, eventId: 'e1', name: 'MTK x Vasas' }] });
  const saved = await saveDefaultSlots(w.db, { partnerId: 'p1' }, { slots }, 'a@x.test', 'now');
  assert.deepEqual(saved.slots, slots);
  assert.deepEqual(saved.followers, [{ id: String(eventId), eventId: 'e1', name: 'MTK x Vasas' }]);
  assert.equal(w.updates[0].collection, 'partners');
  const general = world();
  await saveDefaultSlots(general.db, 'global', { reset: true }, null, 'now');
  assert.equal(general.updates[0].collection, 'admin_settings');
  assert.deepEqual((general.updates[0].update as { $unset: unknown }).$unset, { slots: '' });
});

test('a default that may not be saved is a 400 and nothing is written; an unknown partner is a 404', async () => {
  const w = world();
  const bad = await refused(saveDefaultSlots(w.db, 'global', { slots: { picture: { 'top-center': { source: 'partnerLogo' } } } }, null, 'now'));
  assert.equal(bad?.status, 400);
  assert.equal(w.updates.length, 0);
  assert.equal((await refused(saveDefaultSlots(world({ matched: 0 }).db, { partnerId: 'nobody' }, { slots }, null, 'now')))?.status, 404);
});

test('the view of a level: its own default, the general one it follows, the messages of the sample event, and how many events follow', async () => {
  const sample = { _id: eventId, name: 'MTK x Vasas', frameDesign: { context: { source: 'camera' }, messages: ['HAJRÁ, MTK!'] } };
  const view = await defaultSlotsView(world({ sample, setting: { slots }, followers: [{ _id: eventId, eventId: 'e1', name: 'x' }] }).db, { partnerId: 'p1' }, { defaultFrameSlots: DEFAULT_SLOTS });
  assert.deepEqual(view.slots, DEFAULT_SLOTS);
  assert.deepEqual(view.inherited, slots);
  assert.deepEqual(view.messages, ['HAJRÁ, MTK!']);
  assert.deepEqual(view.sampleEvent, { id: String(eventId), name: 'MTK x Vasas' });
  assert.equal(view.followers, 1);
  const empty = await defaultSlotsView(world().db, 'global');
  assert.equal(empty.slots, null);
  assert.equal(empty.sampleEvent, null);
  assert.ok(empty.messages.length > 0, 'a level with no events still has the default messages');
});

test('a preview is drawn on the sample event, or on a made-up one when the level has no events', async () => {
  const preview = await previewDefaultSlots(world().db, 'global', { slots, messageIndex: 0 });
  assert.ok(preview.png.length > 1000);
  assert.deepEqual([preview.width, preview.height], [1920, 1080]);
  assert.equal((await refused(previewDefaultSlots(world().db, 'global', { slots: 'x' })))?.status, 400);
  const answer = await runDefaultSlotsAction(world().db, 'global', { action: 'preview', slots });
  assert.match((answer as { imageDataUrl: string }).imageDataUrl, /^data:image\/png;base64,/);
});

test('only an event that follows the default is redrawn, one at a time', async () => {
  const w = world({ followers: [{ _id: eventId, eventId: 'e1', name: 'x' }] });
  const drawn: string[] = [];
  const generate = async (_db: Db, event: { eventId?: string }) => (drawn.push(String(event.eventId)), { design: { variants: [{}, {}] } as never, generated: 1, reused: 1 });
  assert.deepEqual(await redrawFollower(w.db, { partnerId: 'p1' }, String(eventId), generate as never), { total: 2, generated: 1, reused: 1 });
  assert.equal(drawn.length, 1);
  assert.equal((await refused(redrawFollower(w.db, { partnerId: 'p1' }, String(new ObjectId()), generate as never)))?.status, 400, 'an event that does not follow');
  assert.equal((await refused(redrawFollower(w.db, { partnerId: 'p1' }, 'nope', generate as never)))?.status, 400);
  assert.equal(drawn.length, 1);
  assert.equal((await refused(runDefaultSlotsAction(w.db, 'global', { action: 'fly' })))?.status, 400);
});
