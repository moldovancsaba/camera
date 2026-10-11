import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { approvePhoto, rejectPhoto, resolveFrameImageUrl, type ReviewActor, type ReviewDeps } from './review';
import { recordApprovalCopies, type ApprovalCopiesInput, type ImageCopyDeps } from '@/lib/storage/image-copies';
import type { ImageCopy } from '@/lib/db/schemas';

const ACTOR: ReviewActor = { email: 'mod@example.com', id: 'u1' };
const PHOTO_URL = 'https://store.test/pending/e1/abc-xyz.jpg';
const VARIANT_URL = 'https://store.test/frames/generated/e1/key.png';
const OWN_FRAME_URL = 'https://store.test/own-frame.png';
const AT = '2026-10-06T12:00:00.000Z';

type Doc = Record<string, unknown>;

async function fixtures() {
  const photo = await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 10, g: 120, b: 10 } } }).jpeg().toBuffer();
  const frame = await sharp({ create: { width: 64, height: 36, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  return { photo, frame };
}

function pendingSubmission(extra: Doc = {}): Doc {
  return {
    _id: new ObjectId(),
    eventId: 'event-uuid',
    partnerId: 'p1',
    userId: 'anonymous',
    reviewStatus: 'pending_review',
    shareToken: 'tok123',
    userInfo: { name: 'Ann', email: 'ann@example.com', collectedAt: AT },
    frameVariant: { index: 0, message: 'Go', imageUrl: VARIANT_URL },
    photoReview: { photoUrl: PHOTO_URL, photoSize: 10, photoMime: 'image/jpeg', shareOptIn: true, submittedAt: AT, tryOn: null },
    metadata: { emailSent: false },
    tryOnRequest: { requested: false, status: 'not_requested' },
    reviewHistory: [],
    ...extra,
  };
}

function setPath(target: Doc, path: string, value: unknown) {
  const parts = path.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Doc;
  node[parts[parts.length - 1]] = value;
}

function fakeDb(submission: Doc, options: { frames?: Doc[]; event?: Doc | null; beforeUpdate?: () => void } = {}) {
  const updates: Array<{ filter: Doc; update: Doc }> = [];
  const db = {
    collection: (name: string) => ({
      findOne: async (filter: Doc) => {
        if (name === 'frames') return options.frames?.find((f) => f.frameId === filter.frameId) ?? null;
        if (name === 'events') return options.event === undefined ? { _id: new ObjectId(), eventId: 'event-uuid', name: 'Derby' } : options.event;
        return null;
      },
      updateOne: async (filter: Doc, update: Doc) => {
        options.beforeUpdate?.();
        updates.push({ filter, update });
        const status = filter.reviewStatus as unknown;
        const allowed = typeof status === 'string' ? [status] : ((status as { $in: string[] } | undefined)?.$in ?? null);
        if (allowed && !allowed.includes(submission.reviewStatus as string)) return { matchedCount: 0 };
        for (const [path, value] of Object.entries((update.$set as Doc) ?? {})) setPath(submission, path, value);
        for (const [path, value] of Object.entries((update.$push as Doc) ?? {})) {
          const list = ((submission[path] as unknown[]) ??= []);
          list.push(value);
        }
        return { matchedCount: 1 };
      },
    }),
  };
  return { db: db as never, updates };
}

interface Calls { fetched: string[]; uploads: Array<{ base64: string; name: string }>; copies: ApprovalCopiesInput[]; approvedMails: unknown[]; rejectedMails: unknown[] }

function deps(photo: Buffer, frame: Buffer, overrides: Partial<ReviewDeps> = {}): { deps: ReviewDeps; calls: Calls } {
  const calls: Calls = { fetched: [], uploads: [], copies: [], approvedMails: [], rejectedMails: [] };
  const base: ReviewDeps = {
    fetchImage: async (url) => {
      calls.fetched.push(url);
      return url === PHOTO_URL ? photo : frame;
    },
    upload: async (base64, name) => {
      calls.uploads.push({ base64, name });
      return { imageUrl: 'https://store.test/submission-1.jpg', deleteUrl: 'https://ibb.co/del', imageId: 'img1', fileSize: base64.length, mimeType: 'image/jpeg' };
    },
    sendApproved: async (_s, _e, url) => (calls.approvedMails.push(url), { sent: true, provider: 'resend', messageId: 'm', recipientEmail: 'ann@example.com' }),
    sendNotApproved: async (_s, _e, url) => (calls.rejectedMails.push(url), { sent: true, provider: 'resend', messageId: 'm', recipientEmail: 'ann@example.com' }),
    imageCopies: (_db, input) => void calls.copies.push(input),
    now: () => AT,
  };
  return { deps: { ...base, ...overrides }, calls };
}

test('approval makes the picture from the photo and the recorded frame image, publishes it and emails the share link', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission();
  const { db, updates } = fakeDb(submission);
  const { deps: d, calls } = deps(photo, frame);
  const result = await approvePhoto(db, submission as never, ACTOR, d);
  assert.deepEqual(result, { ok: true, email: 'sent' });
  assert.deepEqual(calls.fetched, [PHOTO_URL, VARIANT_URL]);
  assert.equal(calls.uploads.length, 1);
  assert.notEqual(calls.uploads[0].base64, photo.toString('base64'), 'the uploaded picture is the composite, not the plain photo');
  assert.equal(submission.reviewStatus, 'approved');
  for (const key of ['imageUrl', 'finalImageUrl', 'originalImageUrl']) assert.equal(submission[key], 'https://store.test/submission-1.jpg');
  assert.equal(submission.isShareVisible, true, 'the guest chose the pledge wall');
  assert.equal(submission.approvedBy, 'mod@example.com');
  assert.deepEqual(submission.reviewHistory, [{ action: 'approve', by: 'mod@example.com', at: AT, reason: null }]);
  assert.deepEqual([(submission.metadata as Doc).finalWidth, (submission.metadata as Doc).finalHeight], [64, 36]);
  assert.equal((submission.metadata as Doc).compositionEngine, 'camera_capture_server');
  assert.equal((submission.metadata as Doc).emailSent, true);
  assert.match(String(calls.approvedMails[0]), /\/share\/tok123$/, 'the link carries the token, not the database id');
  assert.equal((submission.photoReview as Doc).photoUrl, PHOTO_URL, 'the private unframed photo is kept and still named (issue 509)');
  assert.equal(calls.copies.length, 1, 'the copies are recorded after the answer');
  assert.ok(updates[0].filter.reviewStatus, 'the update is conditional on the status');
});

test('approval schedules the screen-sized picture of the published photo once, and a failure there does not undo the approval', async () => {
  const { photo, frame } = await fixtures();
  const scheduled: string[] = [];
  const first = pendingSubmission();
  const a = deps(photo, frame, { screenPicture: (_db, s) => void scheduled.push(`${s.imageUrl}|${s.finalImageUrl}`) });
  assert.equal((await approvePhoto(fakeDb(first).db, first as never, ACTOR, a.deps)).ok, true);
  assert.deepEqual(scheduled, ['https://store.test/submission-1.jpg|https://store.test/submission-1.jpg']);

  const second = pendingSubmission();
  const b = deps(photo, frame, { screenPicture: () => { throw new Error('queue is down'); } });
  assert.equal((await approvePhoto(fakeDb(second).db, second as never, ACTOR, b.deps)).ok, true);
  assert.equal(second.reviewStatus, 'approved');
});

test('approval of a guest who did not tick the pledge wall leaves it unshared', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({ photoReview: { photoUrl: PHOTO_URL, photoSize: 10, photoMime: 'image/jpeg', shareOptIn: false, submittedAt: AT, tryOn: null } });
  const { db } = fakeDb(submission);
  await approvePhoto(db, submission as never, ACTOR, deps(photo, frame).deps);
  assert.equal(submission.isShareVisible, false);
});

test('a try-on request held with an old photo is ignored at approval: the photo is approved, nothing is queued, the private photo is kept', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({
    photoReview: { photoUrl: PHOTO_URL, photoSize: 10, photoMime: 'image/jpeg', shareOptIn: true, submittedAt: AT, tryOn: { leatherSuitId: 'suit-1', setupId: 's1', cameraId: null, outfitBottomLeatherSuitId: null } },
    tryOnRequest: { requested: true, status: 'awaiting_approval' },
  });
  const { db } = fakeDb(submission);
  const { deps: d } = deps(photo, frame);
  const result = await approvePhoto(db, submission as never, ACTOR, d);
  assert.deepEqual(result, { ok: true, email: 'sent' });
  assert.equal('tryOn' in result, false);
  assert.equal(submission.reviewStatus, 'approved');
  assert.equal((submission.photoReview as Doc).photoUrl, PHOTO_URL);
});

test('an event with its own frame is composed with that frame image', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({ frameVariant: undefined, frameId: 'frame-1' });
  const { db } = fakeDb(submission, { frames: [{ frameId: 'frame-1', imageUrl: OWN_FRAME_URL }] });
  const { deps: d, calls } = deps(photo, frame);
  assert.equal((await approvePhoto(db, submission as never, ACTOR, d)).ok, true);
  assert.deepEqual(calls.fetched, [PHOTO_URL, OWN_FRAME_URL]);
  assert.equal(await resolveFrameImageUrl(db, { frameId: 'frame-1' } as never), OWN_FRAME_URL);
  assert.equal(await resolveFrameImageUrl(db, { frameId: null } as never), null);
});

test('a photo with no frame at all is published as it is', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({ frameVariant: undefined, frameId: null });
  const { db } = fakeDb(submission);
  const { deps: d, calls } = deps(photo, frame);
  assert.equal((await approvePhoto(db, submission as never, ACTOR, d)).ok, true);
  assert.deepEqual(calls.fetched, [PHOTO_URL]);
  assert.equal(calls.uploads[0].base64, photo.toString('base64'));
});

test('when the frame cannot be fetched the photo stays pending, nothing is stored and nothing is deleted', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission();
  const { db, updates } = fakeDb(submission);
  const { deps: d, calls } = deps(photo, frame, { fetchImage: async (url) => { if (url === VARIANT_URL) throw new Error('blob down'); return photo; } });
  const result = await approvePhoto(db, submission as never, ACTOR, d);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'compose_failed');
  assert.equal(submission.reviewStatus, 'pending_review');
  assert.equal(updates.length, 0);
  assert.deepEqual([calls.uploads.length, calls.copies.length, calls.approvedMails.length], [0, 0, 0]);
});

test('a photo that is already approved, or has no file, is not approved again', async () => {
  const { photo, frame } = await fixtures();
  const approved = pendingSubmission({ reviewStatus: 'approved' });
  const { deps: d, calls } = deps(photo, frame);
  const first = await approvePhoto(fakeDb(approved).db, approved as never, ACTOR, d);
  assert.equal(!first.ok && first.reason, 'not_reviewable');
  const legacy = pendingSubmission({ reviewStatus: undefined });
  assert.equal(((await approvePhoto(fakeDb(legacy).db, legacy as never, ACTOR, d)) as { reason: string }).reason, 'not_reviewable');
  const missing = pendingSubmission({ photoReview: { photoUrl: null, photoSize: 0, photoMime: 'image/jpeg', shareOptIn: false, submittedAt: AT, tryOn: null } });
  assert.equal(((await approvePhoto(fakeDb(missing).db, missing as never, ACTOR, d)) as { reason: string }).reason, 'no_photo');
  assert.equal(calls.uploads.length, 0);
});

test('when someone else decides first, this approval changes nothing: no email, no copies', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({
    photoReview: { photoUrl: PHOTO_URL, photoSize: 10, photoMime: 'image/jpeg', shareOptIn: true, submittedAt: AT, tryOn: { leatherSuitId: 'suit-1', setupId: null, cameraId: null, outfitBottomLeatherSuitId: null } },
  });
  // The photo was read as pending; by the time the update runs another moderator has approved it.
  const { db } = fakeDb(submission, { beforeUpdate: () => { submission.reviewStatus = 'approved'; } });
  const { deps: d, calls } = deps(photo, frame);
  const result = await approvePhoto(db, { ...submission } as never, ACTOR, d);
  assert.equal(!result.ok && result.reason, 'not_reviewable');
  assert.deepEqual([calls.approvedMails.length, calls.copies.length], [0, 0]);
});

test('a failing email does not undo the approval', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission();
  const { db } = fakeDb(submission);
  const { deps: d } = deps(photo, frame, { sendApproved: async () => { throw new Error('mail down'); } });
  const result = await approvePhoto(db, submission as never, ACTOR, d);
  assert.deepEqual(result, { ok: true, email: 'failed' });
  assert.equal(submission.reviewStatus, 'approved');
});

test('a rejected photo can still be approved later', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({ reviewStatus: 'rejected' });
  const { db } = fakeDb(submission);
  assert.equal((await approvePhoto(db, submission as never, ACTOR, deps(photo, frame).deps)).ok, true);
  assert.equal(submission.reviewStatus, 'approved');
});

test('rejection keeps the photo private, makes no picture and emails the guest', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({ tryOnRequest: { requested: true, status: 'awaiting_approval' } });
  const { db } = fakeDb(submission);
  const { deps: d, calls } = deps(photo, frame);
  const result = await rejectPhoto(db, submission as never, ACTOR, 'Not suitable', d);
  assert.deepEqual(result, { ok: true, email: 'sent' });
  assert.equal(submission.reviewStatus, 'rejected');
  assert.equal(submission.reviewNotes, 'Not suitable');
  assert.equal(submission.isShareVisible, false);
  assert.deepEqual(submission.reviewHistory, [{ action: 'reject', by: 'mod@example.com', at: AT, reason: 'Not suitable' }]);
  for (const key of ['imageUrl', 'finalImageUrl', 'originalImageUrl']) assert.equal(key in submission, false);
  assert.deepEqual([calls.uploads.length, calls.copies.length, calls.fetched.length], [0, 0, 0]);
  assert.match(String(calls.rejectedMails[0]), /\/capture\/event-uuid$/);
});

test('the not-approved e-mail links an event with a URL slug by its short link, the editor’s setting', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission();
  const { db } = fakeDb(submission, { event: { _id: new ObjectId(), eventId: 'event-uuid', name: 'Derby', shortUrlSlug: 'derby' } });
  const { deps: d, calls } = deps(photo, frame);
  await rejectPhoto(db, submission as never, ACTOR, 'Not suitable', d);
  assert.match(String(calls.rejectedMails[0]), /^https:\/\/[^/]+\/derby$/);
});

test('only a pending photo can be rejected', async () => {
  const { photo, frame } = await fixtures();
  const { deps: d, calls } = deps(photo, frame);
  for (const status of ['approved', 'rejected', undefined]) {
    const submission = pendingSubmission({ reviewStatus: status });
    const result = await rejectPhoto(fakeDb(submission).db, submission as never, ACTOR, null, d);
    assert.equal(!result.ok && result.reason, 'not_reviewable');
  }
  assert.equal(calls.rejectedMails.length, 0);
});


// ---- never lose an image (issue 509) ------------------------------------------------------------------------------------------------------------------------------

test('approval never deletes the only copy: the private photo is not deleted, still named on the submission, and the copies work gets everything it needs', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission();
  const { db, updates } = fakeDb(submission);
  const { deps: d, calls } = deps(photo, frame, {
    upload: async () => ({ imageUrl: 'https://store.test/submission-1.jpg', deleteUrl: 'https://ibb.co/del', imageId: 'img1', fileSize: 321, mimeType: 'image/jpeg', mirrorImageUrl: 'https://i.ibb.co/x/y.jpg' }),
  });
  assert.equal((await approvePhoto(db, submission as never, ACTOR, d)).ok, true);
  assert.equal((submission.photoReview as Doc).photoUrl, PHOTO_URL);
  assert.equal(updates.some(({ update }) => JSON.stringify(update).includes('photoReview.photoUrl')), false, 'nothing writes the photo address any more');
  assert.equal(calls.copies.length, 1);
  const input = calls.copies[0];
  assert.equal(String(input.submissionId), String(submission._id));
  assert.deepEqual([input.composed.url, input.composed.bytes], ['https://store.test/submission-1.jpg', 321]);
  assert.deepEqual(await input.composed.mirror, { imageUrl: 'https://i.ibb.co/x/y.jpg', deleteUrl: 'https://ibb.co/del', imageId: 'img1' }, 'an ImgBB copy that answered in time is handed on with its real address and delete link');
  assert.equal(input.unframed?.url, PHOTO_URL);
  assert.ok(input.unframed?.buffer.equals(photo), 'the bytes read from the private file are handed on, so they are not fetched again');
});

test('when the upload brought no ImgBB copy, the copies work is told so (null), not left to guess', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission();
  const { deps: d, calls } = deps(photo, frame, { upload: async () => ({ imageUrl: 'https://store.test/submission-1.jpg', deleteUrl: '', imageId: '', fileSize: 10, mimeType: 'image/jpeg' }) });
  await approvePhoto(fakeDb(submission).db, submission as never, ACTOR, d);
  assert.equal(calls.copies[0].composed.mirror, null);
});

test('a copies step that cannot even be scheduled never undoes the approval', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission();
  const { deps: d } = deps(photo, frame, { imageCopies: () => { throw new Error('queue is down'); } });
  const result = await approvePhoto(fakeDb(submission).db, submission as never, ACTOR, d);
  assert.deepEqual(result, { ok: true, email: 'sent' });
  assert.equal(submission.reviewStatus, 'approved');
  assert.equal((submission.photoReview as Doc).photoUrl, PHOTO_URL);
});

const BLOB_PHOTO = 'https://abc123.public.blob.vercel-storage.com/pending/e1/abc-xyz.jpg';
const BLOB_COMPOSED = 'https://abc123.public.blob.vercel-storage.com/submission-1.jpg';

/** The real copies work with fakes for the hosts, run after the approval and awaited by the test (in the app it runs after the response). */
function withRealCopies(photo: Buffer, frame: Buffer, mode: 'works' | 'fails' | 'hangs' | 'wrong-size') {
  const done: Array<Promise<ImageCopy[]>> = [];
  const hostFiles: Record<string, number> = { [BLOB_PHOTO]: photo.length };
  const fetchImpl = (async (input: unknown) => {
    const size = hostFiles[String(input)];
    return size === undefined ? new Response(null, { status: 404 }) : new Response(null, { status: 206, headers: { 'content-type': 'image/jpeg', 'content-range': `bytes 0-0/${size}` } });
  }) as typeof fetch;
  const copyDeps: ImageCopyDeps = {
    fetch: fetchImpl,
    uploadToImgbb: async (base64, name) => {
      if (mode === 'fails') throw new Error('imgbb answered 500');
      if (mode === 'hangs') return new Promise(() => undefined);
      const imageUrl = `https://i.ibb.co/u/${name}.jpg`;
      hostFiles[imageUrl] = Buffer.from(base64, 'base64').length + (mode === 'wrong-size' ? 3 : 0);
      return { imageUrl, deleteUrl: 'https://ibb.co/u/delete', imageId: 'u1' };
    },
    deleteFromImgbb: async () => true,
    now: () => AT,
    readBackAttempts: 1,
    readBackDelayMs: 0,
    probeTimeoutMs: 1000,
    imgbbTimeoutMs: 30,
    mirrorWaitMs: 30,
  };
  const base = deps(photo, frame, {
    fetchImage: async (url) => (url === BLOB_PHOTO ? photo : frame),
    upload: async (b64) => {
      hostFiles[BLOB_COMPOSED] = Buffer.from(b64, 'base64').length;
      return { imageUrl: BLOB_COMPOSED, deleteUrl: '', imageId: '', fileSize: Buffer.from(b64, 'base64').length, mimeType: 'image/jpeg', mirror: Promise.resolve(null) };
    },
    imageCopies: (database, input) => void done.push(recordApprovalCopies(database, input, copyDeps)),
  });
  return { ...base, done };
}

test('with the real copies work: the approval stays approved and the private photo stays, whatever ImgBB does; every copy and every failure is on the submission', async () => {
  const { photo, frame } = await fixtures();
  for (const mode of ['works', 'fails', 'hangs', 'wrong-size'] as const) {
    const submission = pendingSubmission({ photoReview: { photoUrl: BLOB_PHOTO, photoSize: photo.length, photoMime: 'image/jpeg', shareOptIn: true, submittedAt: AT, tryOn: null } });
    const { db } = fakeDb(submission);
    const { deps: d, done } = withRealCopies(photo, frame, mode);
    const result = await approvePhoto(db, submission as never, ACTOR, d);
    assert.deepEqual(result, { ok: true, email: 'sent' }, `${mode}: the approval answer`);
    assert.equal(submission.reviewStatus, 'approved');
    assert.equal((submission.photoReview as Doc).photoUrl, BLOB_PHOTO, `${mode}: the private photo is kept`);
    // The submission fake of this file keeps `imageCopies` untouched (it only knows $set and $push), so the work is checked on its own result below.
    const made = await done[0];
    const state = (role: string, store: string) => made.find((copy) => copy.role === role && copy.store === store)?.state;
    assert.equal(state('unframed', 'blob'), 'verified', `${mode}: unframed blob`);
    assert.equal(state('composed', 'blob'), 'verified', `${mode}: composed blob`);
    assert.equal(state('composed', 'imgbb'), 'failed', `${mode}: no mirror came with the upload`);
    assert.equal(state('unframed', 'imgbb'), mode === 'works' ? 'verified' : 'failed', `${mode}: unframed imgbb`);
  }
});
