import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { defaultView, fitView, toReframeRecord } from '@/lib/camera/reframe';

const apiReal = await import('@/lib/api');
const originalCaptureId = 'abcdef1234567890abcdef12';

const EVENT = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
const HOST = 'teststoreid.public.blob.vercel-storage.com';
const COMPOSITE = 'https://teststoreid.public.blob.vercel-storage.com/submission-1-composite.jpg';
const ORIGINAL = `https://${HOST}/originals/${EVENT}/${originalCaptureId}.jpg`;
let ipCounter = 0;

type RouteModule = typeof import('./route');

function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

interface Harness {
  inserted: Array<Record<string, unknown>>;
  uploads: number;
  heads: string[];
  puts: Array<{ pathname: string; options: Record<string, unknown> }>;
}

function mockDeps(
  t: TestContext,
  head: (url: string) => Promise<{ size: number; contentType: string }>,
  extra: { event?: Record<string, unknown>; partner?: Record<string, unknown> | null; session?: Record<string, unknown> | null } = {}
): Harness {
  const h: Harness = { inserted: [], uploads: 0, heads: [], puts: [] };
  t.mock.module('@/lib/api', { exports: { ...apiReal, optionalAuth: async () => extra.session ?? null } });
  t.mock.module('@/lib/db/mongodb', {
    exports: {
      connectToDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async () => {
            if (name === 'events') return { _id: 'event-1', name: 'Test event', ...(extra.event ?? {}) };
            if (name === 'partners') return extra.partner ?? null;
            if (name === 'camera_original_assets') {
              const bytes = 3_400_000;
              return {
                eventId: EVENT,
                url: ORIGINAL,
                state: 'verified',
                copies: [
                  { role: 'original', store: 'blob', state: 'verified', url: ORIGINAL, bytes },
                  { role: 'original', store: 'r2', state: 'verified', objectKey: `camera/originals/${EVENT}/${originalCaptureId}/${'a'.repeat(64)}.jpg`, bytes },
                  { role: 'original', store: 'imgbb', state: 'verified', url: 'https://i.ibb.co/original.jpg', deleteUrl: 'https://ibb.co/delete/original', bytes },
                ],
              };
            }
            return null;
          },
          insertOne: async (doc: Record<string, unknown>) => {
            h.inserted.push(doc);
            return { insertedId: new ObjectId() };
          },
          updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
        }),
      }),
    },
  });
  t.mock.module('@/lib/imgbb/upload', {
    exports: {
      uploadImage: async () => {
        h.uploads += 1;
        return { success: true, imageUrl: COMPOSITE, thumbnailUrl: COMPOSITE, deleteUrl: '', imageId: '', fileSize: 4321, mimeType: 'image/jpeg', fileName: 'x.jpg', provider: 'blob', mirrorImageUrl: null };
      },
      uploadToImgbbOnly: async () => { throw new Error('original backup upload should not run in submission tests'); },
      deleteImage: async () => true,
    },
  });
  t.mock.module('@vercel/blob', {
    exports: {
      head: async (url: string) => {
        h.heads.push(url);
        return head(url);
      },
      put: async (pathname: string, _body: unknown, options: Record<string, unknown>) => {
        h.puts.push({ pathname, options });
        return { url: `https://${HOST}/${pathname}-suffix` };
      },
      del: async () => undefined,
    },
  });
  return h;
}

function withStoreToken(): () => void {
  const previous = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststoreid_testsecretvalue0123456789';
  return () => {
    if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous;
  };
}

const record = toReframeRecord(defaultView(1440, 1920), 1440, 1920, 9 / 16, true);

function submissionRequest(extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): NextRequest {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipCounter}`, ...headers },
    body: JSON.stringify({
      imageData: 'data:image/jpeg;base64,AAAA',
      frameId: null,
      eventId: EVENT,
      eventName: 'Test event',
      partnerId: null,
      partnerName: null,
      imageWidth: 1080,
      imageHeight: 1920,
      shareOptIn: false,
      captureId: originalCaptureId,
      originalImageUrl: ORIGINAL,
      originalImageWidth: 1440,
      originalImageHeight: 1920,
      reframe: record,
      ...extra,
    }),
  });
}

const goodHead = async () => ({ size: 3_400_000, contentType: 'image/jpeg' });
const silence = () => {
  const original = [console.log, console.warn, console.error];
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  return () => {
    [console.log, console.warn, console.error] = original;
  };
};

test('a legacy non-event submission without a distinct original keeps the composite as the original', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('legacy');
    const response = await POST(submissionRequest({ eventId: null, originalImageUrl: null, originalImageWidth: null, originalImageHeight: null, reframe: null }));
    assert.equal(response.status, 201);
    assert.equal(h.inserted.length, 1);
    assert.equal(h.inserted[0].originalImageUrl, COMPOSITE);
    assert.equal(h.inserted[0].finalImageUrl, COMPOSITE);
    assert.equal('reframe' in h.inserted[0], false);
    assert.equal(h.heads.length, 0, 'nothing is looked up');
  } finally {
    quiet();
    restore();
  }
});

test('a verified original is stored privately with its true size, type and the reframe record; the composite stays the public image', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('with-original');
    const response = await POST(submissionRequest({ originalImageUrl: ORIGINAL, originalImageWidth: 1440, originalImageHeight: 1920, reframe: record }));
    assert.equal(response.status, 201);
    const doc = h.inserted[0] as Record<string, unknown> & { metadata: Record<string, unknown> };
    assert.equal(doc.originalImageUrl, ORIGINAL);
    assert.equal(doc.finalImageUrl, COMPOSITE);
    assert.equal(doc.imageUrl, COMPOSITE);
    assert.deepEqual(doc.reframe, record);
    assert.equal(doc.metadata.originalWidth, 1440);
    assert.equal(doc.metadata.originalHeight, 1920);
    assert.equal(doc.metadata.originalFileSize, 3_400_000);
    assert.equal(doc.metadata.originalMimeType, 'image/jpeg');
    assert.equal(doc.metadata.finalWidth, 1080, 'the slideshow still reads the composite size');
    assert.equal(h.uploads, 1, 'only the composite goes through uploadImage, so the original never reaches imgbb');
    assert.deepEqual(h.heads, [ORIGINAL]);
  } finally {
    quiet();
    restore();
  }
});

test('a fit record is stored too', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('fit');
    const fit = toReframeRecord(fitView(1440, 1920, 16 / 9), 1440, 1920, 16 / 9, false);
    const response = await POST(submissionRequest({ originalImageUrl: ORIGINAL, originalImageWidth: 1440, originalImageHeight: 1920, reframe: fit }));
    assert.equal(response.status, 201);
    assert.equal((h.inserted[0].reframe as { mode: string }).mode, 'fit');
  } finally {
    quiet();
    restore();
  }
});

for (const [caseId, url] of [
  ['foreign-host', `https://evil.example.com/originals/${EVENT}/a.jpg`],
  ['other-event', `https://${HOST}/originals/another-event-id-9999/a.jpg`],
  ['wrong-folder', `https://${HOST}/submission-1-composite.jpg`],
  ['query-string', `${ORIGINAL}?download=1`],
] as const) {
  test(`an original claim that is ${caseId} is rejected before anything is uploaded, looked up or stored`, async (t) => {
    const restore = withStoreToken();
    const quiet = silence();
    try {
      const h = mockDeps(t, goodHead);
      const { POST } = await importRouteModule(`reject-${caseId}`);
      const response = await POST(submissionRequest({ originalImageUrl: url, originalImageWidth: 1, originalImageHeight: 1, reframe: record }));
      assert.equal(response.status, 400);
      assert.equal(h.uploads, 0, 'nothing uploaded');
      assert.equal(h.inserted.length, 0, 'nothing stored');
      assert.equal(h.heads.length, 0, 'nothing looked up');
    } finally {
      quiet();
      restore();
    }
  });
}

test('an original that is not a JPEG is rejected and nothing is stored', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, async () => ({ size: 1000, contentType: 'text/html' }));
    const { POST } = await importRouteModule('wrong-type');
    const response = await POST(submissionRequest({ originalImageUrl: ORIGINAL, originalImageWidth: 1, originalImageHeight: 1, reframe: record }));
    assert.equal(response.status, 400);
    assert.equal(h.inserted.length, 0);
    assert.equal(h.uploads, 0);
  } finally {
    quiet();
    restore();
  }
});

for (const [label, reframe] of [['missing', undefined], ['invalid', { version: 1, mode: 'zoomed' }]] as const) {
  test(`an original with a ${label} reframe record is rejected and nothing is stored`, async (t) => {
    const restore = withStoreToken();
    const quiet = silence();
    try {
      const h = mockDeps(t, goodHead);
      const { POST } = await importRouteModule(`record-${label}`);
      const response = await POST(
        submissionRequest({ originalImageUrl: ORIGINAL, originalImageWidth: 1, originalImageHeight: 1, reframe: reframe ?? null })
      );
      assert.equal(response.status, 400);
      assert.equal(h.inserted.length, 0);
      assert.equal(h.uploads, 0);
    } finally {
      quiet();
      restore();
    }
  });
}

test('an event submission is rejected when its original cannot be confirmed', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, async () => {
      throw new Error('blob not found');
    });
    const { POST } = await importRouteModule('unconfirmed');
    const response = await POST(submissionRequest({ originalImageUrl: ORIGINAL, originalImageWidth: 1440, originalImageHeight: 1920, reframe: record }));
    assert.equal(response.status, 400);
    assert.equal(h.inserted.length, 0, 'an event capture must not be accepted without its backed-up original');
  } finally {
    quiet();
    restore();
  }
});

const GENERATED = `https://${HOST}/frames/generated/${EVENT}/variant-two.png`;

test('the generated frame variant a photo used is stored with the submission', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('variant');
    const response = await POST(submissionRequest({ frameVariant: { index: 2, message: 'Together for Victory!', imageUrl: GENERATED } }));
    assert.equal(response.status, 201);
    assert.deepEqual(h.inserted[0].frameVariant, { index: 2, message: 'Together for Victory!', imageUrl: GENERATED });
    assert.equal(h.inserted[0].frameId, null, 'a generated frame is not a stored frame');
  } finally {
    quiet();
    restore();
  }
});

test('a variant claim that is not one of our generated images is dropped and the photo still saves', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('variant-bad');
    const response = await POST(submissionRequest({ frameVariant: { index: 0, message: 'x', imageUrl: 'https://evil.example/frames/generated/a.png' } }));
    assert.equal(response.status, 201);
    assert.equal('frameVariant' in h.inserted[0], false);
  } finally {
    quiet();
    restore();
  }
});

test('a submission without a variant has no frameVariant field', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('variant-none');
    assert.equal((await POST(submissionRequest())).status, 201);
    assert.equal('frameVariant' in h.inserted[0], false);
  } finally {
    quiet();
    restore();
  }
});

const VETTED = { photoVetting: { required: true } };
const GUEST = { name: 'Ann Guest', email: 'ann@example.com' };

test('a vetted event saves the photo pending: private, no public picture, no mirror, a share token, and the answer holds nothing public', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: VETTED });
    const { POST } = await importRouteModule('vetted-pending');
    const response = await POST(submissionRequest({ userInfo: GUEST, shareOptIn: true }));
    assert.equal(response.status, 201);
    const text = JSON.stringify(await response.json());
    assert.equal(h.uploads, 0, 'nothing goes through the public upload and its imgbb mirror');
    assert.equal(h.puts.length, 1);
    assert.match(h.puts[0].pathname, /^pending\/event-1\/[0-9a-f]{24}\.jpg$/);
    assert.equal(h.puts[0].options.addRandomSuffix, true);
    const doc = h.inserted[0] as Record<string, unknown> & { photoReview: Record<string, unknown>; metadata: Record<string, unknown> };
    assert.equal(doc.reviewStatus, 'pending_review');
    assert.equal(doc.isShareVisible, false, 'the pledge-wall choice waits for approval');
    assert.equal(doc.photoReview.shareOptIn, true);
    assert.equal(doc.photoReview.photoMime, 'image/jpeg');
    assert.match(String(doc.photoReview.photoUrl), /pending\/event-1\//);
    assert.match(String(doc.shareToken), /^[A-Za-z0-9_-]{24}$/);
    for (const key of ['imageUrl', 'finalImageUrl', 'deleteUrl']) assert.equal(key in doc, false, `no public ${key} before approval`);
    assert.equal(doc.originalImageUrl, ORIGINAL, 'the verified original is retained privately for review and analysis');
    assert.deepEqual(doc.userInfo && { name: (doc.userInfo as Record<string, unknown>).name, email: (doc.userInfo as Record<string, unknown>).email }, GUEST);
    assert.equal(doc.metadata.compositionEngine, 'camera_capture_pending');
    assert.ok(!text.includes('pending/'), 'the response does not carry the private photo URL');
    assert.match(text, /"pending":true/);
  } finally {
    quiet();
    restore();
  }
});

test('a vetted event stores a capture without a registered user as NO USER', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: VETTED });
    const { POST } = await importRouteModule('vetted-no-identity');
    assert.equal((await POST(submissionRequest())).status, 201);
    assert.equal(h.puts.length, 1);
    assert.equal(h.inserted.length, 1);
    const doc = h.inserted[0] as { userName: string; userId: string; metadata: { identityStatus?: string } };
    assert.equal(doc.userName, 'NO USER');
    assert.equal(doc.userId, 'anonymous');
    assert.equal(doc.metadata.identityStatus, 'NO USER');
  } finally {
    quiet();
    restore();
  }
});

test('a selected precheck waits on the private submission until later consent/contact completion', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: {
      ...VETTED,
      photoModerationPrecheck: { enabled: true },
      customPages: [{ pageId: 'consent', pageType: 'accept', order: -1, isActive: true, config: { title: 'Terms', buttonText: 'Continue', checkboxes: [{ text: 'I accept', required: true }] } }, PHOTO_PAGE],
    } });
    const { POST } = await importRouteModule('moderation-intent-before-consent');
    assert.equal((await POST(submissionRequest())).status, 201);
    const doc = h.inserted[0] as Record<string, unknown> & { moderationPrecheck: Record<string, unknown> };
    assert.equal(doc.consentStatus, 'pending');
    assert.equal((doc.guestContact as { status: string }).status, 'awaiting_contact');
    assert.equal(doc.reviewStatus, 'pending_review');
    assert.equal(doc.moderationPrecheck.status, 'queued');
    assert.equal(doc.moderationPrecheck.enabledAtCapture, true);
    assert.match(String(doc.moderationPrecheck.photoUrl), /^https:\/\/teststoreid\.public\.blob\.vercel-storage\.com\/pending\//);
    assert.equal(h.uploads, 0, 'the photo remains in the private pending store');
  } finally {
    quiet();
    restore();
  }
});

test('a social login is enough: the email of the logged-in user is the guest', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: VETTED, session: { user: { id: 'u1', email: 'login@example.com', name: 'Lo Gin' } } });
    const { POST } = await importRouteModule('vetted-login');
    assert.equal((await POST(submissionRequest())).status, 201);
    const doc = h.inserted[0] as { userInfo: { email: string; name: string } };
    assert.equal(doc.userInfo.email, 'login@example.com');
    assert.equal(doc.userInfo.name, 'Lo Gin');
  } finally {
    quiet();
    restore();
  }
});

test('a vetted event retains its verified original privately, refuses something that is not a photo, and ignores the fields of a try-on request an old client may still send (issue 557)', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: VETTED });
    const { POST } = await importRouteModule('vetted-misc');
    const withClaims = await POST(submissionRequest({ userInfo: GUEST, originalImageUrl: ORIGINAL, originalImageWidth: 1440, originalImageHeight: 1920, reframe: record }));
    assert.equal(withClaims.status, 201);
    assert.deepEqual(h.heads, [ORIGINAL], 'the submitted original is verified before it can be retained');
    assert.equal(h.inserted[0].originalImageUrl, ORIGINAL);
    assert.deepEqual(h.inserted[0].reframe, record);
    assert.equal('imageUrl' in h.inserted[0], false, 'the original stays private until approval');

    assert.equal((await POST(submissionRequest({ userInfo: GUEST, imageData: 'data:text/html;base64,AAAA' }))).status, 400);

    // An old client (an open capture page from before the try-on integration was removed) may still send the try-on fields: they change nothing, and the answer carries no try-on state.
    const old = await POST(submissionRequest({ userInfo: GUEST, requestTryOn: true, leatherSuitId: 'suit-1', tryOnSourceImageData: 'data:image/jpeg;base64,AAAA', setupId: 's1', cameraId: 'c1', outfitBottomLeatherSuitId: 'suit-2' }));
    assert.equal(old.status, 201);
    const body = (await old.json()) as { data: Record<string, unknown> };
    assert.equal('tryOn' in body.data, false);
    assert.equal(body.data.pending, true);
    const doc = h.inserted[h.inserted.length - 1] as { photoReview: Record<string, unknown> } & Record<string, unknown>;
    assert.equal('tryOnRequest' in doc, false);
    assert.equal('tryOnJobs' in doc, false);
    assert.equal('tryOn' in doc.photoReview, false);
  } finally {
    quiet();
    restore();
  }
});

test('an event that does not require vetting saves exactly as before', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: { photoVetting: { required: false } } });
    const { POST } = await importRouteModule('not-vetted');
    assert.equal((await POST(submissionRequest())).status, 201);
    assert.equal(h.uploads, 1);
    assert.equal(h.puts.length, 0);
    const doc = h.inserted[0] as Record<string, unknown>;
    assert.equal(doc.imageUrl, COMPOSITE);
    assert.equal('reviewStatus' in doc, false);
    assert.equal('photoReview' in doc, false);
    assert.equal('shareToken' in doc, false);
  } finally {
    quiet();
    restore();
  }
});

// The public gallery permission (issue 554, lib/events/gallery-consent.ts): the event's setting decides, never what the page says it asked.
async function savedWith(t: TestContext, caseId: string, event: Record<string, unknown> | undefined, partner: Record<string, unknown> | null, body: Record<string, unknown>) {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event, partner });
    const { POST } = await importRouteModule(caseId);
    assert.equal((await POST(submissionRequest({
      ...body,
      // These scenarios cover public-gallery choices, so provide the independent consent audit needed for an eligible photo.
      consents: body.consents ?? [{ pageId: 'consent', pageType: 'accept', checkboxText: 'I accept the privacy notice', accepted: true, acceptedAt: '2026-10-10T10:00:00.000Z' }],
    }))).status, 201);
    return h.inserted[0] as Record<string, unknown> & { publicGalleryConsent?: { version: number; grantedAt: string } };
  } finally {
    quiet();
    restore();
  }
}

test('an event that does not ask (the standard) stores the page’s choice as before; a ticked box still leaves its evidence', async (t) => {
  const plain = await savedWith(t, 'gallery-not-asked', undefined, null, { userInfo: GUEST, shareOptIn: true });
  assert.equal(plain.isShareVisible, true);
  assert.equal('publicGalleryConsent' in plain, false);
});

test('an event that asks makes a photo eligible with the ticked box and its version, and keeps the evidence', async (t) => {
  const ticked = await savedWith(t, 'gallery-asked-ticked', { galleryConsent: true }, null, { userInfo: GUEST, shareOptIn: true, publicGalleryConsentVersion: 1 });
  assert.equal(ticked.isShareVisible, true);
  assert.equal(ticked.publicGalleryConsent?.version, 1);
  assert.equal(typeof ticked.publicGalleryConsent?.grantedAt, 'string');
});

test('an event that asks keeps a photo private when the box is not ticked', async (t) => {
  const unticked = await savedWith(t, 'gallery-asked-unticked', { galleryConsent: true }, null, { shareOptIn: false, publicGalleryConsentVersion: 1 });
  assert.equal(unticked.isShareVisible, false);
  assert.equal('publicGalleryConsent' in unticked, false);
});

test('an old page that does not know the setting and sends only shareOptIn true gets a private photo from an event that asks', async (t) => {
  const oldPage = await savedWith(t, 'gallery-asked-old-page', { galleryConsent: true }, null, { shareOptIn: true });
  assert.equal(oldPage.isShareVisible, false, 'no version, no permission');
  assert.equal('publicGalleryConsent' in oldPage, false);
});

test('an event that made no choice follows its partner: the partner asks, so an old page’s shareOptIn true is private', async (t) => {
  const followed = await savedWith(t, 'gallery-partner-asks', { partnerId: 'P1' }, { galleryConsent: true }, { shareOptIn: true });
  assert.equal(followed.isShareVisible, false);
});

test('an event’s own choice not to ask wins over a partner that asks', async (t) => {
  const own = await savedWith(t, 'gallery-own-wins', { partnerId: 'P1', galleryConsent: false }, { galleryConsent: true }, { userInfo: GUEST, shareOptIn: true });
  assert.equal(own.isShareVisible, true);
});

test('a vetted event that asks keeps the choice for the approval: the wall flag waits, the ticked box is the eligibility', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: { ...VETTED, galleryConsent: true } });
    const { POST } = await importRouteModule('gallery-vetted');
    assert.equal((await POST(submissionRequest({ userInfo: GUEST, shareOptIn: true }))).status, 201);
    assert.equal((h.inserted[0] as { photoReview: { shareOptIn: boolean } }).photoReview.shareOptIn, false, 'asked, not ticked: private at approval too');
  } finally {
    quiet();
    restore();
  }
});

// The checkbox settings (issue 558, owner answer 297): shown and required on every kind of checkbox; the server checks what an editor chose to require, and an event that chose nothing is saved exactly as before.
const THREE = [
  { pageId: 'default-consent', pageType: 'accept', checkboxText: 'I accept the Terms and conditions', linkUrl: 'https://seyuselfies.com/en/legal/terms', accepted: true, acceptedAt: '2026-10-10T10:00:00.000Z' },
  { pageId: 'default-consent', pageType: 'accept', checkboxText: 'I accept cookies', linkUrl: 'https://seyuselfies.com/en/legal/cookies', accepted: true, acceptedAt: '2026-10-10T10:00:00.000Z' },
  { pageId: 'default-consent', pageType: 'accept', checkboxText: 'I have read the Privacy policy', linkUrl: 'https://seyuselfies.com/en/policies', accepted: true, acceptedAt: '2026-10-10T10:00:00.000Z' },
];
const OWN_PAGE = (checkboxes: Array<Record<string, unknown>>) => ({ pageId: 'c', pageType: 'accept', order: -2, isActive: true, config: { title: 'T', buttonText: 'Go', checkboxes } });
const PHOTO_PAGE = { pageId: 'tp', pageType: 'take-photo', order: 0, isActive: true, config: {} };

/** One mocked server for a whole test; each call saves (or is refused) with its own event, partner and request, and answers with the status, the error and what was stored by that call. */
function scenario(t: TestContext) {
  const restore = withStoreToken();
  const quiet = silence();
  t.after(() => {
    quiet();
    restore();
  });
  const extra: { event?: Record<string, unknown>; partner?: Record<string, unknown> | null } = {};
  const h = mockDeps(t, goodHead, extra);
  return async (caseId: string, event: Record<string, unknown> | undefined, partner: Record<string, unknown> | null, body: Record<string, unknown>) => {
    extra.event = event;
    extra.partner = partner;
    h.inserted.length = 0;
    const uploadsBefore = h.uploads;
    const { POST } = await importRouteModule(caseId);
    const response = await POST(submissionRequest(body));
    const answer = (await response.json().catch(() => ({}))) as { error?: string };
    return { status: response.status, error: answer.error, inserted: h.inserted.map((doc) => doc as Record<string, unknown> & { consents: unknown[] }), uploaded: h.uploads - uploadsBefore };
  };
}

test('an event that chose nothing saves the consent records exactly as sent, and a save with none at all, as before (the standard is guarded by the page only)', async (t) => {
  const run = scenario(t);
  const withRecords = await run('consent-standard-records', { customPages: [PHOTO_PAGE], journeyDefaults: true }, null, { consents: THREE });
  assert.equal(withRecords.status, 201);
  assert.deepEqual(withRecords.inserted[0].consents, THREE);
  const without = await run('consent-standard-none', { customPages: [OWN_PAGE([{ text: 'A' }, { text: 'B' }]), PHOTO_PAGE], journeyDefaults: true }, null, {});
  assert.equal(without.status, 201, 'the server never refused a photo without a recorded consent (planning item 43)');
  assert.deepEqual(without.inserted[0].consents, []);
  const defaultPage = await run('consent-standard-default-page', { customPages: [PHOTO_PAGE], journeyDefaults: true, acceptanceOnWhoAreYou: true }, null, {});
  assert.equal(defaultPage.status, 201);
  assert.equal(defaultPage.uploaded, 1);
});

test('a record that says it was not ticked is refused unless it says it was optional; an optional unticked box and a ticked one are stored as they are', async (t) => {
  const run = scenario(t);
  const bare = await run('consent-false-bare', undefined, null, { consents: [{ ...THREE[0], accepted: false }] });
  assert.equal(bare.status, 400);
  assert.equal(bare.error, 'All consents must have accepted=true', 'the old answer, word for word');
  assert.equal(bare.inserted.length, 0, 'nothing is stored');
  const optional = { pageId: 'c', pageType: 'accept', checkboxText: 'News', accepted: false, acceptedAt: '2026-10-10T10:00:00.000Z', required: false };
  const tickedOptional = { ...optional, checkboxText: 'Offers', accepted: true };
  const saved = await run('consent-optional', undefined, null, { consents: [THREE[0], optional, tickedOptional] });
  assert.equal(saved.status, 201);
  assert.deepEqual(saved.inserted[0].consents, [THREE[0], optional, tickedOptional]);
  const marketing = { ...optional, kind: 'marketing', checkboxText: 'Nyitott vagyok klub és szurkolói fotó marketing kommunikációra.' };
  const marketingSaved = await run('consent-marketing-optional', undefined, null, { consents: [{ ...marketing, accepted: true }, marketing] });
  assert.equal(marketingSaved.status, 201, 'both an opted-in and opted-out marketing choice are non-blocking');
  assert.deepEqual(marketingSaved.inserted[0].consents, [{ ...marketing, accepted: true }, marketing], 'the marketing kind and each explicit answer are retained');
  const claimsRequired = await run('consent-false-required', undefined, null, { consents: [{ ...optional, required: true }] });
  assert.equal(claimsRequired.status, 400, 'only an optional box can be recorded as not ticked');
});

test('a required checkbox on an own consent page no longer blocks upload; the photo is private and expires after 24 hours until consent is recorded', async (t) => {
  const run = scenario(t);
  const event = { customPages: [OWN_PAGE([{ text: 'A', required: true }, { text: 'B', required: true }, { text: 'C', required: false }]), PHOTO_PAGE] };
  const refused = await run('consent-own-refused', event, null, { consents: [{ pageId: 'c', pageType: 'accept', checkboxText: 'A', accepted: true, acceptedAt: 'x' }] });
  assert.equal(refused.status, 201);
  assert.equal(refused.uploaded, 1, 'the established upload still runs');
  assert.equal(refused.inserted.length, 1);
  assert.equal(refused.inserted[0].consentStatus, 'pending');
  assert.equal(typeof refused.inserted[0].consentExpiresAt, 'string');
  assert.equal(refused.inserted[0].isShareVisible, false, 'a photo awaiting required consent stays private');
  const none = await run('consent-own-none', event, null, {});
  assert.equal(none.status, 201);
  const records = ['A', 'B'].map((checkboxText) => ({ pageId: 'c', pageType: 'accept', checkboxText, accepted: true, acceptedAt: '2026-10-10T10:00:00.000Z' }));
  const saved = await run('consent-own-saved', event, null, { consents: records });
  assert.equal(saved.status, 201);
  assert.equal(saved.inserted[0].consents.length, 2);
});

test('the default consent page: missing partner-required consent no longer blocks upload, and one switched off needs nothing', async (t) => {
  const run = scenario(t);
  const partner = { partnerId: 'P1', consentSettings: { terms: { shown: true, required: true }, cookies: { shown: false } } };
  const event = { partnerId: 'P1', customPages: [PHOTO_PAGE], journeyDefaults: true };
  const refused = await run('consent-partner-refused', event, partner, {});
  assert.equal(refused.status, 201);
  assert.equal(refused.inserted[0].consentStatus, 'pending');
  const saved = await run('consent-partner-saved', event, partner, { consents: THREE.slice(0, 2) });
  assert.equal(saved.status, 201);
  const noDefaults = await run('consent-partner-no-defaults', { partnerId: 'P1', customPages: [PHOTO_PAGE] }, partner, {});
  assert.equal(noDefaults.status, 201, 'an event that does not get the defaults has no default page to require');
  const ownChoice = await run('consent-event-overrides', { ...event, consentSettings: { terms: { shown: true, required: false } } }, partner, {});
  assert.equal(ownChoice.status, 201, 'the event chose optional for the terms; its partner’s choice is not borrowed');
});

test('the public gallery permission set to required: upload proceeds privately without the tick, and stores evidence when ticked', async (t) => {
  const run = scenario(t);
  const event = { galleryConsent: true, consentSettings: { gallery: { required: true } } };
  for (const [caseId, body] of [['no-tick', { shareOptIn: false, publicGalleryConsentVersion: 1 }], ['old-page', { shareOptIn: true }], ['nothing', {}]] as const) {
    const refused = await run(`gallery-required-${caseId}`, event, null, body);
    assert.equal(refused.status, 201, caseId);
    assert.equal(refused.inserted.length, 1);
    assert.equal(refused.inserted[0].consentStatus, 'pending');
    assert.equal(refused.inserted[0].isShareVisible, false);
  }
  const saved = await run('gallery-required-ticked', event, null, {
    userInfo: GUEST,
    shareOptIn: true,
    publicGalleryConsentVersion: 1,
    consents: [{ pageId: 'consent', pageType: 'accept', checkboxText: 'I accept the privacy notice', accepted: true, acceptedAt: '2026-10-10T10:00:00.000Z' }],
  });
  assert.equal(saved.status, 201);
  const doc = saved.inserted[0] as unknown as { isShareVisible: boolean; publicGalleryConsent: { version: number; required?: boolean } };
  assert.equal(doc.isShareVisible, true);
  assert.equal(doc.publicGalleryConsent.version, 1);
  assert.equal(doc.publicGalleryConsent.required, true);
  const viaPartner = await run('gallery-required-partner', { partnerId: 'P1' }, { partnerId: 'P1', galleryConsent: true, consentSettings: { gallery: { required: true } } }, { shareOptIn: false });
  assert.equal(viaPartner.status, 201, 'an event that made no choice follows its partner’s requirement without blocking upload');
  assert.equal(viaPartner.inserted[0].consentStatus, 'pending');
});

test('the acceptance sentence set to required needs a record for each shown checkbox of the consent page it stands for', async (t) => {
  const run = scenario(t);
  const login = { pageId: 'l', pageType: 'who-are-you', order: -1, isActive: true, config: { title: 'W', buttonText: 'Go', nameLabel: 'n', emailLabel: 'e' } };
  const event = { customPages: [OWN_PAGE([{ text: 'A' }, { text: 'B' }, { text: 'C', shown: false }]), login, PHOTO_PAGE], acceptanceOnWhoAreYou: true, consentSettings: { acceptance: { required: true } } };
  const pending = await run('acceptance-required-none', event, null, {});
  assert.equal(pending.status, 201);
  assert.equal(pending.inserted[0].consentStatus, 'pending');
  const records = ['A', 'B'].map((checkboxText) => ({ pageId: 'c', pageType: 'accept', checkboxText, shownText: 'A, B', accepted: true, acceptedAt: '2026-10-10T10:00:00.000Z' }));
  assert.equal((await run('acceptance-required-saved', event, null, { consents: records })).status, 201);
  const optional = { ...event, consentSettings: { acceptance: { required: false } } };
  assert.equal((await run('acceptance-optional-none', optional, null, {})).status, 201);
});

// Decision 243 (issue 521, phase 2): a new photo stores a coarse device and no IP address, and not the user agent.
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5.1 Mobile/15E148 Safari/604.1';
const ANDROID_FB_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A.231105.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0.0]';

test('a new photo stores a device class and a browser family and NOT the IP address or the user agent, whatever the request carried', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('coarse-device');
    const response = await POST(submissionRequest({}, { 'user-agent': IPHONE_UA, 'x-forwarded-for': '203.0.113.77, 10.1.2.3', 'x-real-ip': '203.0.113.78' }));
    assert.equal(response.status, 201);
    const doc = h.inserted[0] as Record<string, unknown> & { metadata: Record<string, unknown> };
    assert.equal(doc.metadata.deviceClass, 'ios');
    assert.equal(doc.metadata.browserFamily, 'safari');
    assert.equal(doc.metadata.deviceType, 'mobile_ios');
    for (const gone of ['ipAddress', 'ip', 'deviceInfo', 'device']) assert.equal(gone in doc.metadata, false, `metadata.${gone} is not written`);
    const stored = JSON.stringify(doc);
    for (const forbidden of ['203.0.113', '10.1.2.3', 'AppleWebKit', '17_5_1', '15E148', 'Mozilla']) assert.equal(stored.includes(forbidden), false, `${forbidden} must not be stored anywhere in the photo`);
  } finally {
    quiet();
    restore();
  }
});

test('the coarse device of an in-app browser on Android, and of a request with no user agent', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('coarse-device-2');
    await POST(submissionRequest({}, { 'user-agent': ANDROID_FB_UA }));
    await POST(submissionRequest());
    const [first, second] = h.inserted.map((doc) => (doc as { metadata: Record<string, unknown> }).metadata);
    assert.deepEqual([first.deviceClass, first.browserFamily, first.deviceType], ['android', 'in-app', 'mobile_android']);
    assert.deepEqual([second.deviceClass, second.browserFamily, second.deviceType], ['unknown', 'unknown', 'unknown']);
    assert.equal(JSON.stringify(h.inserted).includes('Pixel 8'), false);
  } finally {
    quiet();
    restore();
  }
});

test('a vetted event stores the same coarse device and no address either', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: VETTED });
    const { POST } = await importRouteModule('coarse-device-vetted');
    const response = await POST(submissionRequest({ userInfo: { name: 'Ann', email: 'ann@example.test' } }, { 'user-agent': IPHONE_UA, 'x-forwarded-for': '203.0.113.79' }));
    assert.equal(response.status, 201);
    const stored = JSON.stringify(h.inserted[0]);
    assert.equal(stored.includes('203.0.113'), false);
    assert.equal(stored.includes('AppleWebKit'), false);
    assert.equal((h.inserted[0] as { metadata: { deviceClass: string } }).metadata.deviceClass, 'ios');
  } finally {
    quiet();
    restore();
  }
});
