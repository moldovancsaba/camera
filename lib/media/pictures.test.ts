import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { PictureCheck } from './broken';
import { brokenAddresses, brokenPictureRows, clearBrokenCache, collectPictureAddresses, pictureOrNull, scanPictures, withoutBroken } from './pictures';

const LOGO = 'https://i.ibb.co/aaa/club-logo.png';
const FOOTER = 'https://abc.public.blob.vercel-storage.com/footer.png';
const FRAME = 'https://i.ibb.co/bbb/frame.png';
const OVERLAY = 'https://abc.public.blob.vercel-storage.com/overlay.png';
const NOW = new Date('2026-10-10T06:00:00.000Z');

const world = () =>
  fakeDb({
    [COLLECTIONS.EVENTS]: [
      { _id: 'e1', name: 'MTK x Vasas', logoUrl: LOGO, emailFooterImageUrl: FOOTER, link: 'https://go.messmass.com/mtk-vasas', customPages: [{ config: { backgroundImageUrl: FRAME } }], welcomeScreen: { url: OVERLAY, key: 'k' } },
    ],
    [COLLECTIONS.FRAMES]: [{ _id: 'f1', name: 'Frame 1', imageUrl: FRAME, thumbnailUrl: FRAME }],
    [COLLECTIONS.SLIDESHOWS]: [{ _id: 's1', name: 'Default', screenDesign: { overlayImageUrl: OVERLAY, qr: { url: 'https://go.messmass.com/x' } } }],
  });

beforeEach(() => clearBrokenCache());

test('every picture address in use is found once, with where it is used; links and foreign hosts are not pictures', async () => {
  const { db } = world();
  const used = await collectPictureAddresses(db);
  assert.deepEqual([...used.keys()].sort(), [FOOTER, FRAME, LOGO, OVERLAY].sort());
  assert.deepEqual(used.get(FRAME), ['events: MTK x Vasas', 'frames: Frame 1']);
  assert.deepEqual(used.get(OVERLAY), ['events: MTK x Vasas', 'slideshows: Default']);
});

test('the scan marks only a clear "gone", records an unclear answer without changing an earlier one, and a picture that answers again is cleared', async () => {
  const { db, data } = world();
  const answers: Record<string, PictureCheck> = { [LOGO]: 'broken', [FOOTER]: 'ok', [FRAME]: 'unknown', [OVERLAY]: 'ok' };
  const first = await scanPictures(db, { now: NOW }, async (url) => answers[url]);
  assert.deepEqual(first, { processed: 4, broken: 1, cleared: 0, unknown: 1, remaining: 0 });
  const rows = Object.fromEntries((data[COLLECTIONS.PICTURE_HEALTH] ?? []).map((r) => [r._id as string, r]));
  assert.equal(rows[LOGO].broken, true);
  assert.equal(rows[FOOTER].broken, false);
  assert.equal(rows[FRAME].broken, false, 'not told: nothing is hidden');
  assert.deepEqual(rows[LOGO].where, ['events: MTK x Vasas']);

  // nothing is due again at once, so the admin's loop ends; a week later everything is due
  assert.equal((await scanPictures(db, { now: NOW }, async () => 'ok')).processed, 0);
  const later = new Date(NOW.getTime() + 7 * 86_400_000);
  const second = await scanPictures(db, { now: later }, async (url) => (url === LOGO ? 'ok' : answers[url]));
  assert.equal(second.cleared, 1);
  assert.equal((data[COLLECTIONS.PICTURE_HEALTH] ?? []).find((r) => r._id === LOGO)?.broken, false);
});

test('an address that stays unclear is tried once per batch and does not hold the loop: remaining reaches 0', async () => {
  const { db } = world();
  let rounds = 0;
  for (;;) {
    const batch = await scanPictures(db, { now: NOW, limit: 1 }, async () => 'unknown');
    rounds += 1;
    if (batch.remaining === 0) break;
    assert.ok(rounds < 10, 'the loop must end');
  }
  assert.equal(rounds, 4);
});

test('the guest pages read the broken addresses (kept for a minute) and leave them out; nothing broken sends the same value', async () => {
  const { db } = world();
  await scanPictures(db, { now: NOW }, async (url) => (url === LOGO || url === FRAME ? 'broken' : 'ok'));
  const broken = await brokenAddresses(db, 1_000);
  assert.deepEqual([...broken].sort(), [FRAME, LOGO].sort());
  // a later scan clears the cache, and within the minute the cached set is used
  assert.equal(await brokenAddresses(db, 30_000), broken);
  const rows = await brokenPictureRows(db);
  assert.deepEqual(rows.map((r) => r.url).sort(), [FRAME, LOGO].sort());

  const payload = { logoUrl: LOGO, emailFooterImageUrl: FOOTER, pages: [{ config: { backgroundImageUrl: FRAME, title: 'Hi' } }], images: [LOGO, FOOTER], when: new Date(NOW) };
  const clean = withoutBroken(payload, broken);
  assert.deepEqual(clean, { emailFooterImageUrl: FOOTER, pages: [{ config: { title: 'Hi' } }], images: [FOOTER], when: payload.when });
  assert.equal(withoutBroken(payload, new Set()), payload, 'nothing broken: untouched');
  assert.equal(pictureOrNull(LOGO, broken), null);
  assert.equal(pictureOrNull(FOOTER, broken), FOOTER);
  assert.equal(pictureOrNull(undefined, broken), null);
});
