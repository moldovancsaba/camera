import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deviceClassOf, photoFactsOf, PHOTO_PROJECTION } from './facts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

/** A photo of a vetted event as POST /api/submissions saves it, then approved. */
const vetted = (extra: Record<string, unknown> = {}) => ({
  _id: 'abc',
  userId: 'anonymous',
  userEmail: 'anonymous@event',
  eventId: 'ev-1',
  eventIds: ['ev-1'],
  method: 'camera_capture',
  submissionKind: 'original',
  isArchived: false,
  reviewStatus: 'approved',
  photoReview: { submittedAt: '2026-10-16T18:00:00.000Z', shareOptIn: true, photoUrl: null },
  reviewHistory: [{ action: 'approve', by: 'Ann@Club.test', at: '2026-10-16T18:02:00.000Z', reason: null }],
  userInfo: { name: 'Kata', email: 'Kata@Example.test', collectedAt: '2026-10-16T17:59:00.000Z' },
  consents: [{ pageId: 'default-consent', pageType: 'accept', checkboxText: 'I accept the terms', shownText: 'I accept the terms and the privacy notice', accepted: true, acceptedAt: '2026-10-16T17:59:30.000Z' }],
  metadata: { deviceInfo: IPHONE, emailSent: true, emailSentAfterSave: true, emailSentAt: '2026-10-16T18:02:05.000Z' },
  createdAt: '2026-10-16T18:00:00.000Z',
  ...extra,
});

test('device class from the user agent: phones by system, desktops, and an empty agent is not recorded', () => {
  assert.equal(deviceClassOf(IPHONE), 'ios');
  assert.equal(deviceClassOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(deviceClassOf(ANDROID), 'android');
  assert.equal(deviceClassOf(MAC), 'desktop');
  assert.equal(deviceClassOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop');
  assert.equal(deviceClassOf(''), 'unknown');
  assert.equal(deviceClassOf(undefined), 'unknown');
  assert.equal(deviceClassOf('curl/8.0'), 'unknown');
});

test('a vetted, approved photo: the state, the decisions, the time it was handed in, the user (lower case e-mail), the consent sentence the user read', () => {
  const facts = photoFactsOf(vetted());
  assert.ok(facts);
  assert.equal(facts.source, 'user');
  assert.equal(facts.review, 'approved');
  assert.equal(facts.excluded, null);
  assert.equal(facts.method, 'camera');
  assert.equal(facts.device, 'ios');
  assert.equal(facts.submittedAt, '2026-10-16T18:00:00.000Z');
  assert.deepEqual(facts.decisions, [{ action: 'approve', by: 'Ann@Club.test', at: '2026-10-16T18:02:00.000Z', reason: null }]);
  assert.equal(facts.identity, 'email');
  assert.equal(facts.userKey, 'kata@example.test');
  assert.equal(facts.wallOptIn, true);
  assert.deepEqual(facts.consents, [{ label: 'I accept the terms and the privacy notice', pageType: 'accept', at: '2026-10-16T17:59:30.000Z' }]);
  assert.equal(facts.emails.photoLink, 'sent');
  assert.equal(facts.emails.photoLinkKind, 'afterSave');
});

test('a signed-in user is told apart by the account e-mail; the placeholders anonymous@event and admin@upload are no e-mail', () => {
  const signedIn = photoFactsOf(vetted({ userId: 'sso-1', userEmail: 'Fan@Example.test', userInfo: undefined }));
  assert.equal(signedIn?.identity, 'signed_in');
  assert.equal(signedIn?.userKey, 'fan@example.test');
  const anonymous = photoFactsOf(vetted({ userInfo: undefined }));
  assert.equal(anonymous?.identity, 'none');
  assert.equal(anonymous?.userKey, null);
  assert.equal(anonymous?.email, null);
  const noEmailAccount = photoFactsOf(vetted({ userId: 'sso-2', userEmail: 'anonymous@event', userInfo: undefined }));
  assert.equal(noEmailAccount?.identity, 'signed_in');
  assert.equal(noEmailAccount?.userKey, 'id:sso-2', 'an account without an e-mail is still one user');
});

test('a photo an editor added in the gallery is not a user: no identity, no user key, and the upload placeholder is no e-mail', () => {
  const facts = photoFactsOf({ _id: 'g1', userId: 'admin-1', userEmail: 'admin@upload', userName: 'Eve (gallery upload)', eventId: 'ev-1', metadata: { adminGalleryUpload: true, device: IPHONE }, createdAt: '2026-10-16T12:00:00.000Z', isArchived: false });
  assert.ok(facts);
  assert.equal(facts.source, 'editor');
  assert.equal(facts.identity, 'none');
  assert.equal(facts.userKey, null);
  assert.equal(facts.review, 'none');
  assert.equal(facts.method, 'unknown');
});

test('a try-on result is not a photo of this report; a missing kind is an original (343 older photos have none)', () => {
  assert.equal(photoFactsOf({ _id: 't', submissionKind: 'tryon_result' }), null);
  assert.equal(photoFactsOf(null), null);
  assert.equal(photoFactsOf(undefined), null);
  assert.ok(photoFactsOf({ _id: 'old', createdAt: '2026-09-01T10:00:00.000Z' }));
});

test('left out: removed from the event, and a picture that is gone; the waiting and rejected states', () => {
  assert.equal(photoFactsOf(vetted({ isArchived: true }))?.excluded, 'archived');
  assert.equal(photoFactsOf(vetted({ mediaHealth: { broken: true } }))?.excluded, 'broken');
  assert.equal(photoFactsOf(vetted({ isArchived: true, mediaHealth: { broken: true } }))?.excluded, 'archived');
  assert.equal(photoFactsOf(vetted({ reviewStatus: 'pending_review', reviewHistory: [] }))?.review, 'waiting');
  assert.equal(photoFactsOf(vetted({ reviewStatus: 'rejected' }))?.review, 'rejected');
  assert.equal(photoFactsOf({ _id: 'o' })?.review, 'none');
});

test('decisions are kept in the order they were made, with only valid rows', () => {
  const facts = photoFactsOf(
    vetted({
      reviewHistory: [
        { action: 'approve', by: 'b', at: '2026-10-16T19:00:00.000Z' },
        { action: 'reject', by: 'a', at: '2026-10-16T18:05:00.000Z', reason: '  not me  ' },
        { action: 'maybe', by: 'a', at: '2026-10-16T18:06:00.000Z' },
        { action: 'reject', by: 'a' },
      ],
    }),
  );
  assert.deepEqual(facts?.decisions.map((d) => [d.action, d.by, d.reason]), [['reject', 'a', 'not me'], ['approve', 'b', null]]);
});

test('consents: only accepted ones; the sentence the user read comes before the checkbox text; long text is cut', () => {
  const facts = photoFactsOf(
    vetted({
      consents: [
        { pageType: 'cta', checkboxText: 'Send me news', accepted: true, acceptedAt: '2026-10-16T17:59:31.000Z' },
        { pageType: 'accept', checkboxText: 'Declined', accepted: false },
        { pageType: 'accept', checkboxText: 'x'.repeat(400), accepted: true },
        { pageType: 'accept' },
      ],
    }),
  );
  assert.equal(facts?.consents.length, 2);
  assert.deepEqual(facts?.consents[0], { label: 'Send me news', pageType: 'cta', at: '2026-10-16T17:59:31.000Z' });
  assert.equal(facts?.consents[1].label.length, 160);
});

test('frame, message and layout: an own frame by its name; the generated frame by its message and the layout image', () => {
  const own = photoFactsOf(vetted({ frameId: 'f1', frameName: 'Away kit' }));
  assert.deepEqual(own?.frame, { kind: 'own', label: 'Away kit' });
  const generated = photoFactsOf(vetted({ frameVariant: { index: 2, message: 'Hajrá Vasas!', imageUrl: 'https://blob.example/frames/generated/9a8b7c6d5e4f.png' } }));
  assert.deepEqual(generated?.frame, { kind: 'generated', label: 'Generated default frame' });
  assert.equal(generated?.message, 'Hajrá Vasas!');
  assert.equal(generated?.layout, '9a8b7c6d5e4f');
  assert.deepEqual(photoFactsOf(vetted())?.frame, { kind: 'none', label: 'No frame' });
});

test('plays: the running total, and the count and last time per slideshow; a missing total is the sum', () => {
  const facts = photoFactsOf(vetted({ playCount: 7, lastPlayedAt: '2026-10-16T20:00:00.000Z', slideshowPlays: { 'show-a': { count: 5, lastPlayedAt: '2026-10-16T20:00:00.000Z' }, 'show-b': { count: 2, lastPlayedAt: '2026-10-16T19:00:00.000Z' } } }));
  assert.equal(facts?.plays, 7);
  assert.deepEqual(facts?.playsBySlideshow['show-b'], { count: 2, lastPlayedAt: '2026-10-16T19:00:00.000Z' });
  assert.equal(photoFactsOf(vetted({ slideshowPlays: { a: { count: 3 }, b: { count: 4 } } }))?.plays, 7);
  assert.equal(photoFactsOf(vetted())?.plays, 0);
});

test('e-mails: sent, failed, skipped with the reason, the arrived mail and the declined mail', () => {
  assert.equal(photoFactsOf(vetted({ metadata: { emailSent: false, emailFailedAt: '2026-10-16T18:03:00.000Z' } }))?.emails.photoLink, 'failed');
  const skipped = photoFactsOf(vetted({ metadata: { emailSent: false, emailSkippedAt: '2026-10-16T18:03:00.000Z', emailSkipReason: 'missing_recipient' } }));
  assert.equal(skipped?.emails.photoLink, 'skipped');
  assert.equal(skipped?.emails.photoLinkSkipReason, 'missing_recipient');
  assert.equal(photoFactsOf(vetted({ metadata: {} }))?.emails.photoLink, null);
  assert.equal(photoFactsOf(vetted({ metadata: { arrivedEmailSentAt: '2026-10-16T18:00:05.000Z' } }))?.emails.arrived, true);
  assert.equal(photoFactsOf(vetted({ metadata: { rejectionEmailSent: true } }))?.emails.declined, 'sent');
  assert.equal(photoFactsOf(vetted({ metadata: { rejectionEmailSent: false } }))?.emails.declined, 'not_sent');
});

test('the people of the photo are passed on untouched, with who marked them and when', () => {
  const facts = photoFactsOf(vetted({ people: [], peopleReview: { by: 'ann@club.test', at: '2026-10-16T18:01:00.000Z' } }));
  assert.deepEqual(facts?.people, []);
  assert.equal(facts?.peopleBy, 'ann@club.test');
  assert.equal(photoFactsOf(vetted())?.people, undefined, 'nobody looked');
});

test('the projection never asks for a field and its parent together (a path collision is an error in MongoDB)', () => {
  const paths = Object.keys(PHOTO_PROJECTION);
  for (const path of paths) {
    const parent = path.split('.').slice(0, -1).join('.');
    assert.ok(!parent || !paths.includes(parent), `${path} collides with ${parent}`);
  }
});
