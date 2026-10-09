import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { defaultView, fitView, toReframeRecord } from '@/lib/camera/reframe';

const apiReal = await import('@/lib/api');

const EVENT = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
const HOST = 'teststoreid.public.blob.vercel-storage.com';
const COMPOSITE = 'https://teststoreid.public.blob.vercel-storage.com/submission-1-composite.jpg';
const ORIGINAL = `https://${HOST}/originals/${EVENT}/abc123-xyz.jpg`;
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
  extra: { event?: Record<string, unknown>; session?: Record<string, unknown> | null } = {}
): Harness {
  const h: Harness = { inserted: [], uploads: 0, heads: [], puts: [] };
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, optionalAuth: async () => extra.session ?? null } });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async () => (name === 'events' ? { _id: 'event-1', name: 'Test event', ...(extra.event ?? {}) } : null),
          insertOne: async (doc: Record<string, unknown>) => {
            h.inserted.push(doc);
            return { insertedId: new ObjectId() };
          },
        }),
      }),
    },
  });
  t.mock.module('@/lib/imgbb/upload', {
    namedExports: {
      uploadImage: async () => {
        h.uploads += 1;
        return { success: true, imageUrl: COMPOSITE, thumbnailUrl: COMPOSITE, deleteUrl: '', imageId: '', fileSize: 4321, mimeType: 'image/jpeg', fileName: 'x.jpg', provider: 'blob', mirrorImageUrl: null };
      },
    },
  });
  t.mock.module('@vercel/blob', {
    namedExports: {
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

function submissionRequest(extra: Record<string, unknown> = {}): NextRequest {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipCounter}` },
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

test('without an original the submission is stored exactly as before: the composite is also the original', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('legacy');
    const response = await POST(submissionRequest());
    assert.equal(response.status, 201);
    assert.equal(h.inserted.length, 1);
    assert.equal(h.inserted[0].originalImageUrl, COMPOSITE);
    assert.equal(h.inserted[0].finalImageUrl, COMPOSITE);
    assert.equal(h.inserted[0].isShareVisible, false, 'sharing is off unless explicitly selected');
    assert.equal(h.inserted[0].publicGalleryConsent, null, 'legacy-style requests have no consent evidence');
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

test('an explicit public-gallery choice stores versioned consent evidence', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('explicit-gallery-consent');
    const response = await POST(submissionRequest({ shareOptIn: true, publicGalleryConsentVersion: 1 }));
    assert.equal(response.status, 201);
    const doc = h.inserted[0] as Record<string, unknown> & { publicGalleryConsent: { version: number; grantedAt: string } };
    assert.equal(doc.isShareVisible, true);
    assert.equal(doc.publicGalleryConsent.version, 1);
    assert.equal(typeof doc.publicGalleryConsent.grantedAt, 'string');
  } finally {
    quiet();
    restore();
  }
});

test('a legacy client cannot publish a photo by sending the old default-true field', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead);
    const { POST } = await importRouteModule('legacy-share-payload');
    const response = await POST(submissionRequest({ shareOptIn: true }));
    assert.equal(response.status, 201);
    assert.equal(h.inserted[0].isShareVisible, false);
    assert.equal(h.inserted[0].publicGalleryConsent, null);
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
        submissionRequest({ originalImageUrl: ORIGINAL, originalImageWidth: 1, originalImageHeight: 1, ...(reframe ? { reframe } : {}) })
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

test('an original that cannot be confirmed keeps the photo: it is saved without the original and without the record', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, async () => {
      throw new Error('blob not found');
    });
    const { POST } = await importRouteModule('unconfirmed');
    const response = await POST(submissionRequest({ originalImageUrl: ORIGINAL, originalImageWidth: 1440, originalImageHeight: 1920, reframe: record }));
    assert.equal(response.status, 201);
    assert.equal(h.inserted[0].originalImageUrl, COMPOSITE);
    assert.equal('reframe' in h.inserted[0], false, 'no record without a distinct original, so the composite stays usable as the fallback');
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
    const response = await POST(submissionRequest({ userInfo: GUEST, shareOptIn: true, publicGalleryConsentVersion: 1 }));
    assert.equal(response.status, 201);
    const text = JSON.stringify(await response.json());
    assert.equal(h.uploads, 0, 'nothing goes through the public upload and its imgbb mirror');
    assert.equal(h.puts.length, 1);
    assert.match(h.puts[0].pathname, /^pending\/event-1\/[0-9a-f]{24}\.jpg$/);
    assert.equal(h.puts[0].options.addRandomSuffix, true);
    const doc = h.inserted[0] as Record<string, unknown> & { photoReview: Record<string, unknown>; metadata: Record<string, unknown>; publicGalleryConsent: { version: number; grantedAt: string } };
    assert.equal(doc.reviewStatus, 'pending_review');
    assert.equal(doc.isShareVisible, false, 'the pledge-wall choice waits for approval');
    assert.equal(doc.photoReview.shareOptIn, true);
    assert.equal(doc.publicGalleryConsent.version, 1);
    assert.equal(doc.photoReview.photoMime, 'image/jpeg');
    assert.match(String(doc.photoReview.photoUrl), /pending\/event-1\//);
    assert.match(String(doc.shareToken), /^[A-Za-z0-9_-]{24}$/);
    for (const key of ['imageUrl', 'finalImageUrl', 'originalImageUrl', 'deleteUrl']) assert.equal(key in doc, false, `no ${key} before approval`);
    assert.deepEqual(doc.userInfo && { name: (doc.userInfo as Record<string, unknown>).name, email: (doc.userInfo as Record<string, unknown>).email }, GUEST);
    assert.equal(doc.metadata.compositionEngine, 'camera_capture_pending');
    assert.ok(!text.includes('pending/'), 'the response does not carry the private photo URL');
    assert.match(text, /"pending":true/);
  } finally {
    quiet();
    restore();
  }
});

test('a vetted event does not save a photo without an email or a login, and stores nothing', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: VETTED });
    const { POST } = await importRouteModule('vetted-no-identity');
    assert.equal((await POST(submissionRequest())).status, 400);
    assert.equal((await POST(submissionRequest({ userInfo: { name: 'Ann', email: 'not an email' } }))).status, 400);
    assert.equal(h.puts.length, 0);
    assert.equal(h.inserted.length, 0);
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

test('a vetted event ignores a claimed original, refuses something that is not a photo, and holds the try-on until approval', async (t) => {
  const restore = withStoreToken();
  const quiet = silence();
  try {
    const h = mockDeps(t, goodHead, { event: VETTED });
    const { POST } = await importRouteModule('vetted-misc');
    const withClaims = await POST(submissionRequest({ userInfo: GUEST, originalImageUrl: ORIGINAL, originalImageWidth: 1440, originalImageHeight: 1920, reframe: record }));
    assert.equal(withClaims.status, 201);
    assert.equal(h.heads.length, 0, 'the claimed original is never looked at');
    assert.equal('reframe' in h.inserted[0], false);

    assert.equal((await POST(submissionRequest({ userInfo: GUEST, imageData: 'data:text/html;base64,AAAA' }))).status, 400);

    const tryOn = await POST(submissionRequest({ userInfo: GUEST, requestTryOn: true, leatherSuitId: 'suit-1', tryOnSourceImageData: 'data:image/jpeg;base64,AAAA' }));
    assert.equal(tryOn.status, 201);
    const body = (await tryOn.json()) as { data: { tryOn: { status: string; jobId: string | null } } };
    assert.equal(body.data.tryOn.status, 'awaiting_approval');
    assert.equal(body.data.tryOn.jobId, null);
    const doc = h.inserted[h.inserted.length - 1] as { photoReview: { tryOn: Record<string, unknown> | null }; tryOnRequest: { status: string } };
    assert.equal(doc.tryOnRequest.status, 'awaiting_approval');
    assert.deepEqual(doc.photoReview.tryOn, { leatherSuitId: 'suit-1', setupId: null, cameraId: null, outfitBottomLeatherSuitId: null });
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
