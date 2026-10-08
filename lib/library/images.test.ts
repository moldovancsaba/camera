import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import sharp from 'sharp';
import { fakeDb } from './fake-db';

// The file store is the only thing faked: the real uploadImage runs (it reads the File itself, camera's server has no FileReader), the imgbb
// mirror is off (no key), and Vercel Blob keeps what it was given in `stored`.
for (const key of ['IMGBB_API_KEY', 'NEXT_PUBLIC_IMG_BB_API_KEY', 'IMG_BB_API_KEY']) delete process.env[key];
const stored: Array<{ name: string; contentType: string; bytes: number }> = [];
mock.module('@vercel/blob', {
  namedExports: {
    put: async (name: string, body: Buffer, options: { contentType: string }) => {
      stored.push({ name, contentType: options.contentType, bytes: body.byteLength });
      return { url: `https://store.example.test/${name}` };
    },
  },
});

const { KIND_META, eventAssignedIds, isAssignedKind, parseKind, partnerDefaultIds, partnerSavedIds } = await import('./kinds');
const { deleteLibraryUpload, loadEventLibrary, loadPartnerLibrary, savePartnerLibrary } = await import('./db');
const { createLibraryItem } = await import('./upload');
const { deleteGlobalImage, listGlobalImages, setGlobalImageActive } = await import('./images');

const NOW = '2026-10-08T12:00:00.000Z';
const URL_OF = (id: string) => `https://store.example.test/${id}.png`;
const picture = (pictureId: string, extra: Record<string, unknown> = {}) => ({ pictureId, name: `Picture ${pictureId}`, imageUrl: URL_OF(pictureId), thumbnailUrl: URL_OF(pictureId), isActive: true, createdAt: `2026-10-0${pictureId.length}T00:00:00.000Z`, ...extra });

function seed() {
  return fakeDb({
    images: [
      picture('g1'),
      picture('g2'),
      picture('g3', { isActive: false }),
      picture('p1', { scope: 'partner', partnerId: 'P' }),
      picture('x1', { scope: 'partner', partnerId: 'OTHER' }),
      picture('e1', { scope: 'event', eventId: 'E', partnerId: 'P' }),
      picture('e2', { scope: 'event', eventId: 'OTHER-EVENT', partnerId: 'P' }),
    ],
    frames: [{ frameId: 'f1', name: 'Frame f1', imageUrl: 'https://store.example.test/f1.png', isActive: true }],
    logos: [{ logoId: 'l1', name: 'Logo l1', imageUrl: 'https://store.example.test/l1.png', isActive: true }],
    partners: [{ partnerId: 'P', name: 'Partner P', defaultFrames: ['f1'], defaultLogos: [{ logoId: 'l1', scenario: 'loading-capture', order: 0 }] }, { partnerId: 'OTHER', name: 'Other partner' }],
    events: [
      // A stray `images` list on an event is not an assignment: images are never assigned.
      { eventId: 'E', partnerId: 'P', name: 'Event E', frames: [{ frameId: 'f1', isActive: true }], images: [{ pictureId: 'g2' }], emailFooterImageUrl: URL_OF('g1') },
      { eventId: 'OTHER-EVENT', partnerId: 'P', name: 'Other event', frames: [] },
      { eventId: 'LONE', name: 'Event without a partner' },
    ],
  });
}

const partner = (extra: Record<string, unknown> = {}) => ({ partnerId: 'P', name: 'Partner P', defaultFrames: ['f1'], defaultLogos: [{ logoId: 'l1', scenario: 'loading-capture', order: 0 }], ...extra });
const ids = (items: Array<{ id: string }>) => items.map((i) => i.id).sort();

test('images are a kind of their own: collection images, id pictureId; they are not assigned to an event and have no defaults', () => {
  assert.equal(parseKind('images'), 'images');
  assert.deepEqual(KIND_META.images, { collection: 'images', idField: 'pictureId', noun: 'image' });
  assert.deepEqual([isAssignedKind('frames'), isAssignedKind('logos'), isAssignedKind('images')], [true, true, false]);
  assert.deepEqual(eventAssignedIds('images', { images: [{ pictureId: 'g2' }] }), [], 'a list on the event is not read as assignments');
  assert.deepEqual(partnerDefaultIds('images', partner()), [], 'never the default frames or logos of the partner');
  assert.deepEqual(partnerSavedIds('images', { library: { images: ['g1', 'g1'] } }), ['g1']);
  assert.equal(partnerSavedIds('images', { library: { frames: ['f1'] } }), undefined, 'a library saved before images existed has no images list yet');
});

test("a partner's images library: what it took from the global library and its own uploads; until its first save, its own uploads only", async () => {
  const { db } = seed();
  const fresh = await loadPartnerLibrary(db, partner(), 'images');
  assert.equal(fresh.saved, false);
  assert.deepEqual(ids(fresh.items), ['p1'], 'it had no images before the libraries: not its frames, not its logos, not what an event field shows');
  assert.deepEqual(fresh.missing, []);
  assert.deepEqual(ids(fresh.available), ['g1', 'g2'], 'the active global images; g3 is off, the uploads of others are not offered');
  const saved = await loadPartnerLibrary(db, partner({ library: { frames: ['f1'], logos: [], images: ['g1', 'g3', 'gone'] } }), 'images');
  assert.deepEqual(ids(saved.items.filter((i) => i.via === 'assigned')), ['g1', 'g3']);
  assert.equal(saved.items.find((i) => i.id === 'g3')?.itemActive, false, 'a picture switched off later stays in the library, marked');
  assert.deepEqual(saved.missing, ['gone']);
  assert.deepEqual(ids(saved.available), ['g2']);
});

test('adding a global image saves the images list and, as the first save, the frames and logos the partner had; nothing else changes', async () => {
  const { db, data } = seed();
  const result = await savePartnerLibrary(db, partner(), 'images', { add: ['g1'] }, NOW);
  assert.deepEqual(result, { ok: true, defaults: [], defaultsChanged: false, removedInUse: {} });
  const saved = data.partners[0] as { library: Record<string, string[]>; defaultFrames: string[] };
  assert.deepEqual(saved.library, { frames: ['f1'], logos: ['l1'], images: ['g1'] });
  assert.deepEqual(saved.defaultFrames, ['f1'], 'the default frames are untouched');
  const event = data.events[0] as Record<string, unknown>;
  assert.equal(event.emailFooterImageUrl, URL_OF('g1'));
  assert.deepEqual(event.frames, [{ frameId: 'f1', isActive: true }]);
});

test('a partner takes global images only, active ones, and an image has no default for new events', async () => {
  const { db, data } = seed();
  for (const id of ['x1', 'p1', 'e1', 'g3']) assert.equal((await savePartnerLibrary(db, partner(), 'images', { add: [id] }, NOW)).ok, false, id);
  const unknown = await savePartnerLibrary(db, partner(), 'images', { add: ['nope'] }, NOW);
  assert.deepEqual([unknown.ok, unknown.ok ? 0 : unknown.status], [false, 404]);
  const defaults = await savePartnerLibrary(db, partner(), 'images', { defaults: ['g1'] }, NOW);
  assert.equal(defaults.ok, false);
  assert.match(defaults.ok ? '' : defaults.reason, /no default for new events/);
  assert.equal(data.partners[0].library, undefined, 'a refused edit writes nothing');
});

test('removing an image from the partner library changes no event: the fields keep their address', async () => {
  const { db, data } = seed();
  const result = await savePartnerLibrary(db, partner({ library: { frames: ['f1'], logos: ['l1'], images: ['g1', 'g2'] } }), 'images', { remove: ['g1'] }, NOW);
  assert.deepEqual(result, { ok: true, defaults: [], defaultsChanged: false, removedInUse: {} });
  assert.deepEqual((data.partners[0] as { library: { images: string[] } }).library.images, ['g2']);
  assert.equal((data.events[0] as Record<string, unknown>).emailFooterImageUrl, URL_OF('g1'));
});

test("an event's images library: its partner's library and its own uploads, nothing assigned, nobody else's uploads", async () => {
  const { db } = seed();
  const event = (await db.collection('events').findOne({ eventId: 'E' }))!;
  const fresh = await loadEventLibrary(db, event, 'images');
  assert.deepEqual(fresh.assigned, [], 'nothing is assigned, not even the stray list on the event');
  assert.deepEqual(fresh.missing, []);
  assert.deepEqual(ids(fresh.available), ['e1', 'p1'], 'the partner has taken no global image yet');
  await savePartnerLibrary(db, partner(), 'images', { add: ['g1', 'g2'] }, NOW);
  await db.collection('images').updateOne({ pictureId: 'g2' }, { $set: { isActive: false } });
  const later = await loadEventLibrary(db, event, 'images');
  assert.deepEqual(ids(later.available), ['e1', 'g1', 'p1'], 'g1 from the partner library; g2 is switched off; e2 belongs to another event');
  const lone = (await db.collection('events').findOne({ eventId: 'LONE' }))!;
  assert.deepEqual(ids((await loadEventLibrary(db, lone, 'images')).available), [], 'no partner: only its own uploads');
});

test('deleting an own image upload leaves the event as it is; the uploads of others are refused', async () => {
  const { db, data, calls } = seed();
  assert.equal((await deleteLibraryUpload(db, 'images', 'e2', { scope: 'event', eventId: 'E' })).ok, false);
  assert.equal((await deleteLibraryUpload(db, 'images', 'g1', { scope: 'event', eventId: 'E' })).ok, false);
  assert.deepEqual(await deleteLibraryUpload(db, 'images', 'e1', { scope: 'event', eventId: 'E' }), { ok: true });
  assert.deepEqual(await deleteLibraryUpload(db, 'images', 'p1', { scope: 'partner', partnerId: 'P' }), { ok: true }, 'no event "uses" an image, so nothing blocks it');
  assert.equal((await deleteLibraryUpload(db, 'images', 'x1', { scope: 'partner', partnerId: 'P' })).ok, false);
  assert.deepEqual(data.images.map((i) => i.pictureId).sort(), ['e2', 'g1', 'g2', 'g3', 'x1']);
  assert.equal(calls.some((c) => c.collection === 'events'), false, 'no event was written');
});

const pngFile = async (name: string, width: number, height: number) =>
  new File([new Uint8Array(await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer())], name, { type: 'image/png' });

test('an image upload is stored with its size in pixels, the address of the stored file and its owner', async () => {
  const { db, data } = seed();
  stored.length = 0;
  const result = await createLibraryItem(db, { kind: 'images', file: await pngFile('pitch.png', 32, 18), name: ' Pitch ', description: 'Behind the button', createdBy: 'u1', owner: { scope: 'event', eventId: 'E', partnerId: 'P' } });
  assert.equal(result.ok, true);
  const doc = data.images.at(-1) as Record<string, unknown>;
  const { pictureId, createdAt, updatedAt, ...rest } = doc;
  assert.equal(typeof pictureId, 'string');
  assert.deepEqual([createdAt === updatedAt, typeof createdAt], [true, 'string']);
  assert.deepEqual(rest, {
    name: 'Pitch',
    description: 'Behind the button',
    imageUrl: `https://store.example.test/${stored[0].name}`,
    thumbnailUrl: `https://store.example.test/${stored[0].name}`,
    width: 32,
    height: 18,
    fileSize: stored[0].bytes,
    mimeType: 'image/png',
    isActive: true,
    createdBy: 'u1',
    scope: 'event',
    eventId: 'E',
    partnerId: 'P',
  });
  assert.equal('imageId' in doc, false, 'no imageId on a picture: on a frame that is the imgbb asset id');
});

test('an SVG is taken, with its size from the file; a global upload carries scope global', async () => {
  const { db, data } = seed();
  stored.length = 0;
  const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>'], 'crest.svg', { type: 'image/svg+xml' });
  const result = await createLibraryItem(db, { kind: 'images', file: svg, name: 'Crest', createdBy: 'u1', owner: { scope: 'global' } });
  assert.equal(result.ok, true);
  const doc = data.images.at(-1) as Record<string, unknown>;
  assert.deepEqual([doc.width, doc.height, doc.mimeType, doc.scope, doc.partnerId, doc.eventId], [40, 20, 'image/svg+xml', 'global', undefined, undefined]);
  assert.equal(stored[0].contentType, 'image/svg+xml');
});

test('a GIF, a file over 4 MB and an empty name are refused before anything is stored', async () => {
  const { db, data } = seed();
  stored.length = 0;
  const before = data.images.length;
  const owner = { scope: 'partner' as const, partnerId: 'P' };
  const gif = await createLibraryItem(db, { kind: 'images', file: new File([new Uint8Array([71, 73, 70])], 'a.gif', { type: 'image/gif' }), name: 'x', createdBy: 'u1', owner });
  assert.match(gif.ok ? '' : gif.reason, /PNG, JPEG, WebP or SVG/);
  const big = await createLibraryItem(db, { kind: 'images', file: new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }), name: 'x', createdBy: 'u1', owner });
  assert.match(big.ok ? '' : big.reason, /too big: 4 MB at most/);
  const unnamed = await createLibraryItem(db, { kind: 'images', file: await pngFile('a.png', 2, 2), name: '  ', createdBy: 'u1', owner });
  assert.equal(unnamed.ok, false);
  assert.deepEqual(stored, []);
  assert.equal(data.images.length, before);
});

test('the global list holds the global images only; the every-upload view says whose upload each one is', async () => {
  const { db } = seed();
  assert.deepEqual(ids(await listGlobalImages(db, { all: false })), ['g1', 'g2', 'g3']);
  const all = await listGlobalImages(db, { all: true });
  assert.equal(all.length, 7);
  assert.deepEqual(all.find((i) => i.id === 'p1')?.owner, { level: 'partner', name: 'Partner P' });
  assert.deepEqual(all.find((i) => i.id === 'e1')?.owner, { level: 'event', name: 'Event E' });
  assert.equal(all.find((i) => i.id === 'g1')?.owner, null);
});

test('a global image is switched off and on; an upload of a partner or an event is not changed from the global page', async () => {
  const { db, data } = seed();
  const off = await setGlobalImageActive(db, 'g1', false, NOW);
  assert.equal(off.ok && off.item.itemActive, false);
  assert.equal((data.images[0] as { isActive: boolean }).isActive, false);
  assert.equal((await setGlobalImageActive(db, 'g1', true, NOW)).ok, true);
  const partnerUpload = await setGlobalImageActive(db, 'p1', false, NOW);
  assert.deepEqual([partnerUpload.ok, partnerUpload.ok ? 0 : partnerUpload.status], [false, 400]);
  assert.match(partnerUpload.ok ? '' : partnerUpload.reason, /Images page of that partner/);
  const unknown = await setGlobalImageActive(db, 'nope', false, NOW);
  assert.deepEqual([unknown.ok, unknown.ok ? 0 : unknown.status], [false, 404]);
});

test('deleting a global image takes it out of every partner library; the fields that show it keep their address', async () => {
  const { db, data } = seed();
  await savePartnerLibrary(db, partner(), 'images', { add: ['g1', 'g2'] }, NOW);
  const result = await deleteGlobalImage(db, 'g1');
  assert.deepEqual(result, { ok: true, partnersUpdated: 1 });
  assert.deepEqual((data.partners[0] as { library: { images: string[] } }).library.images, ['g2']);
  assert.equal(data.images.some((i) => i.pictureId === 'g1'), false);
  assert.equal((data.events[0] as Record<string, unknown>).emailFooterImageUrl, URL_OF('g1'));
  assert.equal((await deleteGlobalImage(db, 'e1')).ok, false, 'an event upload is deleted on its event page');
});
