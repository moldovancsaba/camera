import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { clearBrokenCache } from '@/lib/media/pictures';
import { COLLECTIONS } from '@/lib/db/schemas';
import { chooseStageBackground, isGeneratedOverlay, storeStagePick, storedStagePick, type StageBackgroundDeps } from './stage-background';

const NOW = '2026-10-11T12:00:00.000Z';
// The id's last letter orders them by age (b is newer than a): the lists are newest first.
const bg = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Stadium ${pictureId}`, imageUrl: `https://store.public.blob.vercel-storage.com/${pictureId}.png`, thumbnailUrl: null, isActive: true, tags: ['stadium-background'], scope: 'global', createdAt: `2026-10-01T00:00:0${pictureId.charCodeAt(pictureId.length - 1) % 10}.000Z`, ...extra });

function world(images: Array<Record<string, unknown>>, eventExtra: Record<string, unknown> = {}) {
  clearBrokenCache();
  return fakeDb({ images, partners: [{ partnerId: 'P', name: 'MTK' }], events: [{ _id: 'm1', eventId: 'E', partnerId: 'P', name: 'Match', ...eventExtra }] });
}
const deps = (fetched: string[], missing: string[] = [], random = () => 0): StageBackgroundDeps => ({
  fetchImage: async (url) => {
    fetched.push(url);
    return missing.some((name) => url.endsWith(`${name}.png`)) ? null : Buffer.from(url);
  },
  random,
});

test('with no stadium background in the library there is no pick, nothing is fetched and the built-in stage is drawn', async () => {
  const w = world([]);
  const fetched: string[] = [];
  assert.equal(await chooseStageBackground(w.db, w.data[COLLECTIONS.EVENTS][0], deps(fetched)), null);
  assert.deepEqual(fetched, []);
});

test('a random active global stadium background is picked when the event has nothing of its own; a switched off, untagged or other kind is not', async () => {
  const w = world([bg('a'), bg('b'), bg('off', { isActive: false }), bg('plain', { tags: undefined }), bg('selfie', { tags: ['sample-selfie'] })]);
  const fetched: string[] = [];
  const event = w.data[COLLECTIONS.EVENTS][0];
  assert.equal((await chooseStageBackground(w.db, event, deps(fetched, [], () => 0)))!.pictureId, 'b', 'newest first, the random pick is the first');
  assert.equal((await chooseStageBackground(w.db, event, deps(fetched, [], () => 0.99)))!.pictureId, 'a');
  assert.ok(fetched.every((url) => /\/(a|b)\.png$/.test(url)), 'only the two active stadium backgrounds are ever fetched');
});

test('the event\'s own choice wins over its partner\'s and the global ones', async () => {
  const w = world([bg('g1'), bg('p1', { scope: 'partner', partnerId: 'P' }), bg('e1', { scope: 'event', eventId: 'E', partnerId: 'P' })], { slots: { stadium: { items: ['e1'], useDefault: false } } });
  assert.equal((await chooseStageBackground(w.db, w.data[COLLECTIONS.EVENTS][0], deps([])))!.pictureId, 'e1');
  const partnerOnly = world([bg('g1'), bg('p1', { scope: 'partner', partnerId: 'P' })]);
  partnerOnly.data[COLLECTIONS.PARTNERS][0].slots = { stadium: { items: ['p1'], useDefault: false } };
  assert.equal((await chooseStageBackground(partnerOnly.db, partnerOnly.data[COLLECTIONS.EVENTS][0], deps([])))!.pictureId, 'p1', 'the partner replaced the global set');
  const none = world([bg('g1')], { slots: { stadium: { useDefault: false } } });
  assert.equal(await chooseStageBackground(none.db, none.data[COLLECTIONS.EVENTS][0], deps([])), null, 'the event chose none: the built-in stage');
});

test('the stored pick stays while it is among what the event uses; "again" takes another; a pick that left the set is replaced', async () => {
  const w = world([bg('a'), bg('b'), bg('c')], { stageBackground: { pictureId: 'b', pickedAt: NOW } });
  const event = w.data[COLLECTIONS.EVENTS][0];
  assert.equal((await chooseStageBackground(w.db, event, deps([], [], () => 0)))!.pictureId, 'b');
  assert.notEqual((await chooseStageBackground(w.db, event, deps([], [], () => 0), { again: true }))!.pictureId, 'b');
  assert.notEqual((await chooseStageBackground(w.db, { ...event, stageBackground: { pictureId: 'gone', pickedAt: NOW } }, deps([], [], () => 0)))!.pictureId, 'gone');
});

test('a picture that cannot be fetched is skipped for the next, and with none that can be fetched there is no pick: never an error', async () => {
  const w = world([bg('a'), bg('b')]);
  const event = w.data[COLLECTIONS.EVENTS][0];
  const fetched: string[] = [];
  const next = await chooseStageBackground(w.db, event, deps(fetched, ['b'], () => 0));
  assert.equal(next!.pictureId, 'a', 'the first choice (b, the newest) could not be fetched, the next is used');
  assert.equal(fetched.length, 2);
  assert.equal(await chooseStageBackground(w.db, event, deps([], ['a', 'b'])), null);
});

test('a picture the registry knows is gone is never tried', async () => {
  const w = world([bg('a'), bg('b')]);
  w.data.picture_health = [{ _id: 'https://store.public.blob.vercel-storage.com/b.png', broken: true } as never];
  clearBrokenCache();
  const fetched: string[] = [];
  assert.equal((await chooseStageBackground(w.db, w.data[COLLECTIONS.EVENTS][0], deps(fetched, [], () => 0)))!.pictureId, 'a');
  assert.ok(!fetched.some((url) => url.endsWith('/b.png')));
  clearBrokenCache();
});

test('the pick is stored once; the same pick writes nothing; no pick removes a stored one only when asked', async () => {
  const w = world([bg('a')]);
  const event = () => w.data[COLLECTIONS.EVENTS][0];
  await storeStagePick(w.db, event(), 'a', NOW);
  assert.deepEqual(event().stageBackground, { pictureId: 'a', pickedAt: NOW });
  const writes = w.calls.length;
  await storeStagePick(w.db, event(), 'a', '2026-10-12T00:00:00.000Z');
  assert.equal(w.calls.length, writes, 'the same pick writes nothing');
  await storeStagePick(w.db, event(), null, NOW);
  assert.equal(storedStagePick(event()), 'a', 'no pick does not remove it unless asked');
  await storeStagePick(w.db, event(), null, NOW, { clear: true });
  assert.equal(event().stageBackground, undefined);
});

test('only an overlay the system drew for this event counts as generated: the designers\' picture and any chosen one are never touched', () => {
  assert.equal(isGeneratedOverlay('https://x.public.blob.vercel-storage.com/screens/E/default-0123456789abcdef.png', 'E'), true);
  assert.equal(isGeneratedOverlay('https://x.public.blob.vercel-storage.com/screens/OTHER/default-0123456789abcdef.png', 'E'), false);
  assert.equal(isGeneratedOverlay('https://pub.r2.dev/landing/mtk-vasas/Seyu_MTK_VASAS_Overlay2.png', 'E'), false);
  assert.equal(isGeneratedOverlay('https://x.public.blob.vercel-storage.com/screens/E/welcome-0123456789abcdef.png', 'E'), false);
  assert.equal(isGeneratedOverlay('', 'E'), false);
  assert.equal(isGeneratedOverlay('not a url', 'E'), false);
  assert.equal(isGeneratedOverlay(undefined, 'E'), false);
});
