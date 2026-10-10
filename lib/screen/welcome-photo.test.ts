import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import { eligiblePhoto, listWindowPhotos, windowPictureOf } from './welcome-photo';

const EVENT = { _id: new ObjectId(), eventId: 'E', name: 'Match' };
const guest = (extra: Record<string, unknown> = {}) => ({ _id: new ObjectId(), eventId: 'E', eventIds: ['E'], imageUrl: 'https://i.ibb.co/x/guest.png', userName: 'Secret Name', userEmail: 'secret@example.com', createdAt: '2026-10-10T10:00:00.000Z', ...extra });
const upload = (extra: Record<string, unknown> = {}) => ({ _id: new ObjectId(), eventId: 'E', eventIds: ['E'], imageUrl: 'https://i.ibb.co/x/framed.png', originalImageUrl: 'https://i.ibb.co/x/plain.png', metadata: { adminGalleryUpload: true, galleryFrame: true }, createdAt: '2026-10-09T10:00:00.000Z', ...extra });

test('an editor’s upload is clean (its plain original when a frame was put on it, or the upload itself while it has none); anything else is the public, framed picture', () => {
  assert.deepEqual(windowPictureOf(upload() as never), { url: 'https://i.ibb.co/x/plain.png', framed: false });
  assert.deepEqual(windowPictureOf(upload({ originalImageUrl: undefined, imageUrl: 'https://i.ibb.co/x/raw.png', metadata: { adminGalleryUpload: true } }) as never), { url: 'https://i.ibb.co/x/raw.png', framed: false });
  assert.deepEqual(windowPictureOf(upload({ originalImageUrl: undefined }) as never), { url: 'https://i.ibb.co/x/framed.png', framed: true }, 'framed with no plain original: used as it is');
  assert.deepEqual(windowPictureOf(guest({ screenImageUrl: 'https://store.public.blob.vercel-storage.com/s.webp' }) as never), { url: 'https://store.public.blob.vercel-storage.com/s.webp', framed: true });
  assert.deepEqual(windowPictureOf(guest() as never), { url: 'https://i.ibb.co/x/guest.png', framed: true });
  assert.equal(windowPictureOf({ eventId: 'E' } as never), null);
});

test('only a photo of this event that passes the one visibility rule can be shown: approved, not hidden, not archived, not broken, not a try-on result; nothing else is asked (owner answer 256)', async () => {
  const ok = guest({ reviewStatus: 'approved' });
  const legacy = guest();
  const pending = guest({ reviewStatus: 'pending_review' });
  const rejected = guest({ reviewStatus: 'rejected' });
  const hidden = guest({ hiddenFromEvents: ['E'] });
  const archived = guest({ isArchived: true });
  const broken = guest({ mediaHealth: { broken: true } });
  const other = guest({ eventId: 'F', eventIds: ['F'] });
  const tryon = guest({ submissionKind: 'tryon_result', reviewStatus: 'approved' });
  const noConsent = guest({ consents: [], shareOptIn: false, reviewStatus: 'approved' });
  const { db } = fakeDb({ [COLLECTIONS.SUBMISSIONS]: [ok, legacy, pending, rejected, hidden, archived, broken, other, tryon, noConsent] });
  for (const good of [ok, legacy, noConsent]) assert.ok(await eligiblePhoto(db, EVENT, String(good._id)), 'shown');
  for (const bad of [pending, rejected, hidden, archived, broken, other, tryon]) assert.equal(await eligiblePhoto(db, EVENT, String(bad._id)), null);
  assert.equal(await eligiblePhoto(db, EVENT, 'nope'), null);
  assert.equal(await eligiblePhoto(db, EVENT, String(new ObjectId())), null, 'a photo that is gone');
});

test('the list has the editor’s clean uploads first, then the newest approved photos, shows nothing that cannot be shown, and no name or e-mail', async () => {
  const clean = upload();
  const newest = guest({ reviewStatus: 'approved', createdAt: '2026-10-10T12:00:00.000Z' });
  const older = guest({ reviewStatus: 'approved', createdAt: '2026-10-10T08:00:00.000Z' });
  const pending = guest({ reviewStatus: 'pending_review' });
  const other = guest({ eventId: 'F', eventIds: ['F'], reviewStatus: 'approved' });
  const { db } = fakeDb({ [COLLECTIONS.SUBMISSIONS]: [older, pending, newest, clean, other] });
  const photos = await listWindowPhotos(db, EVENT);
  assert.deepEqual(photos.map((p) => [p.id, p.kind]), [[String(clean._id), 'clean'], [String(newest._id), 'framed'], [String(older._id), 'framed']]);
  assert.equal(photos[0].imageUrl, 'https://i.ibb.co/x/plain.png', 'a clean upload is shown as its plain picture');
  assert.doesNotMatch(JSON.stringify(photos), /Secret|secret@/);
});
