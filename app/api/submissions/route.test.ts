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
}

function mockDeps(
  t: TestContext,
  head: (url: string) => Promise<{ size: number; contentType: string }>
): Harness {
  const h: Harness = { inserted: [], uploads: 0, heads: [] };
  t.mock.module('@/lib/api', { namedExports: { ...apiReal, optionalAuth: async () => null } });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async () => (name === 'events' ? { _id: 'event-1', name: 'Test event' } : null),
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
      put: async () => ({ url: COMPOSITE }),
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

const GENERATED = `https://${HOST}/frames/generated/${EVENT}/0123456789abcdef.png`;

test('the generated frame variant a photo used is stored with the submission (camera#236)', async (t) => {
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
