import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { approvePhoto, rejectPhoto, resolveFrameImageUrl, type ReviewActor, type ReviewDeps } from './review';

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
        if (name === 'events') return options.event === undefined ? { _id: new ObjectId(), eventId: 'event-uuid', name: 'Derby', tryOn: { enabled: true } } : options.event;
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

interface Calls { fetched: string[]; uploads: Array<{ base64: string; name: string }>; deleted: string[]; tryOn: unknown[]; approvedMails: unknown[]; rejectedMails: unknown[] }

function deps(photo: Buffer, frame: Buffer, overrides: Partial<ReviewDeps> = {}): { deps: ReviewDeps; calls: Calls } {
  const calls: Calls = { fetched: [], uploads: [], deleted: [], tryOn: [], approvedMails: [], rejectedMails: [] };
  const base: ReviewDeps = {
    fetchImage: async (url) => {
      calls.fetched.push(url);
      return url === PHOTO_URL ? photo : frame;
    },
    upload: async (base64, name) => {
      calls.uploads.push({ base64, name });
      return { imageUrl: 'https://store.test/submission-1.jpg', deleteUrl: 'https://ibb.co/del', imageId: 'img1', fileSize: base64.length, mimeType: 'image/jpeg' };
    },
    deleteFile: async (url) => void calls.deleted.push(url),
    enqueueTryOn: async (_db, input) => (calls.tryOn.push(input), { status: 'queued', jobId: 'job-1', error: null }),
    sendApproved: async (_s, _e, url) => (calls.approvedMails.push(url), { sent: true, provider: 'resend', messageId: 'm', recipientEmail: 'ann@example.com' }),
    sendNotApproved: async (_s, _e, url) => (calls.rejectedMails.push(url), { sent: true, provider: 'resend', messageId: 'm', recipientEmail: 'ann@example.com' }),
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
  assert.deepEqual(result, { ok: true, tryOn: null, email: 'sent' });
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
  assert.deepEqual(calls.deleted, [PHOTO_URL], 'the private photo is deleted');
  assert.equal((submission.photoReview as Doc).photoUrl, null);
  assert.ok(updates[0].filter.reviewStatus, 'the update is conditional on the status');
});

test('approval of a guest who did not tick the pledge wall leaves it unshared', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({ photoReview: { photoUrl: PHOTO_URL, photoSize: 10, photoMime: 'image/jpeg', shareOptIn: false, submittedAt: AT, tryOn: null } });
  const { db } = fakeDb(submission);
  await approvePhoto(db, submission as never, ACTOR, deps(photo, frame).deps);
  assert.equal(submission.isShareVisible, false);
});

test('a held try-on request is queued at approval with the plain photo as its source', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({
    photoReview: { photoUrl: PHOTO_URL, photoSize: 10, photoMime: 'image/jpeg', shareOptIn: true, submittedAt: AT, tryOn: { leatherSuitId: 'suit-1', setupId: 's1', cameraId: null, outfitBottomLeatherSuitId: null } },
    tryOnRequest: { requested: true, status: 'awaiting_approval' },
  });
  const { db } = fakeDb(submission);
  const { deps: d, calls } = deps(photo, frame);
  const result = await approvePhoto(db, submission as never, ACTOR, d);
  assert.equal(result.ok && result.tryOn?.status, 'queued');
  const input = calls.tryOn[0] as { request: { leatherSuitId: string; sourceImageData: string; setupId: string }; eventId: string; submissionId: string };
  assert.equal(input.request.leatherSuitId, 'suit-1');
  assert.equal(input.request.setupId, 's1');
  assert.equal(input.request.sourceImageData, `data:image/jpeg;base64,${photo.toString('base64')}`);
  assert.equal(input.eventId, 'event-uuid');
  assert.equal(input.submissionId, String(submission._id));
  assert.deepEqual(calls.deleted, [PHOTO_URL], 'deleted only after the try-on source was taken');
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
  assert.deepEqual([calls.uploads.length, calls.deleted.length, calls.approvedMails.length], [0, 0, 0]);
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

test('when someone else decides first, this approval changes nothing: no email, no try-on, no delete', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({
    photoReview: { photoUrl: PHOTO_URL, photoSize: 10, photoMime: 'image/jpeg', shareOptIn: true, submittedAt: AT, tryOn: { leatherSuitId: 'suit-1', setupId: null, cameraId: null, outfitBottomLeatherSuitId: null } },
  });
  // The photo was read as pending; by the time the update runs another moderator has approved it.
  const { db } = fakeDb(submission, { beforeUpdate: () => { submission.reviewStatus = 'approved'; } });
  const { deps: d, calls } = deps(photo, frame);
  const result = await approvePhoto(db, { ...submission } as never, ACTOR, d);
  assert.equal(!result.ok && result.reason, 'not_reviewable');
  assert.deepEqual([calls.tryOn.length, calls.approvedMails.length, calls.deleted.length], [0, 0, 0]);
});

test('a failing email does not undo the approval', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission();
  const { db } = fakeDb(submission);
  const { deps: d } = deps(photo, frame, { sendApproved: async () => { throw new Error('mail down'); } });
  const result = await approvePhoto(db, submission as never, ACTOR, d);
  assert.deepEqual(result, { ok: true, tryOn: null, email: 'failed' });
  assert.equal(submission.reviewStatus, 'approved');
});

test('a rejected photo can still be approved later', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({ reviewStatus: 'rejected' });
  const { db } = fakeDb(submission);
  assert.equal((await approvePhoto(db, submission as never, ACTOR, deps(photo, frame).deps)).ok, true);
  assert.equal(submission.reviewStatus, 'approved');
});

test('rejection keeps the photo private, makes no picture, cancels the held try-on and emails the guest', async () => {
  const { photo, frame } = await fixtures();
  const submission = pendingSubmission({ tryOnRequest: { requested: true, status: 'awaiting_approval' } });
  const { db } = fakeDb(submission);
  const { deps: d, calls } = deps(photo, frame);
  const result = await rejectPhoto(db, submission as never, ACTOR, 'Not suitable', d);
  assert.deepEqual(result, { ok: true, email: 'sent' });
  assert.equal(submission.reviewStatus, 'rejected');
  assert.equal(submission.reviewNotes, 'Not suitable');
  assert.equal(submission.isShareVisible, false);
  assert.equal((submission.tryOnRequest as Doc).status, 'cancelled');
  assert.deepEqual(submission.reviewHistory, [{ action: 'reject', by: 'mod@example.com', at: AT, reason: 'Not suitable' }]);
  for (const key of ['imageUrl', 'finalImageUrl', 'originalImageUrl']) assert.equal(key in submission, false);
  assert.deepEqual([calls.uploads.length, calls.deleted.length, calls.fetched.length], [0, 0, 0]);
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
