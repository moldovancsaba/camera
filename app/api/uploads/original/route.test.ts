import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { getPayloadFromClientToken } from '@vercel/blob/client';

const EVENT = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
const PATH = `originals/${EVENT}/abc123.jpg`;
let ipCounter = 0;

type RouteModule = typeof import('./route');

// A fresh (uncached) import per test so each test's mocks bind to its own copy of route.ts.
function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

function mockEvents(t: TestContext, existingEventIds: string[]) {
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: () => ({
          findOne: async (filter: { eventId?: string }) =>
            filter.eventId && existingEventIds.includes(filter.eventId) ? { _id: 'event-1' } : null,
        }),
      }),
    },
  });
}

function tokenRequest(
  pathname: string,
  clientPayload: string | null,
  options: { type?: string; ip?: string } = {}
): NextRequest {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/uploads/original', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': options.ip ?? `198.51.100.${ipCounter}` },
    body: JSON.stringify({ type: options.type ?? 'blob.generate-client-token', payload: { pathname, clientPayload, multipart: false } }),
  });
}

function withBlobToken(): () => void {
  const previous = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststoreid_testsecretvalue0123456789';
  return () => {
    if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous;
  };
}

test('an existing event gets a short-lived token that allows exactly one JPEG of limited size at that path', async (t) => {
  const restore = withBlobToken();
  try {
    mockEvents(t, [EVENT]);
    const { POST } = await importRouteModule('ok');
    const started = Date.now();
    const response = await POST(tokenRequest(PATH, JSON.stringify({ eventId: EVENT })));
    assert.equal(response.status, 200);

    const body = (await response.json()) as { type: string; clientToken: string };
    assert.equal(body.type, 'blob.generate-client-token');
    const payload = getPayloadFromClientToken(body.clientToken) as unknown as Record<string, unknown>;
    assert.equal(payload.pathname, PATH);
    assert.deepEqual(payload.allowedContentTypes, ['image/jpeg']);
    assert.equal(payload.maximumSizeInBytes, 15 * 1024 * 1024);
    assert.equal(payload.addRandomSuffix, true);
    const validUntil = Number(payload.validUntil);
    assert.ok(validUntil > started && validUntil <= started + 10 * 60 * 1000 + 5000, 'valid for at most ten minutes');
    assert.equal(payload.callbackUrl, undefined, 'no completion callback is requested');
  } finally {
    restore();
  }
});

test('an unknown event gets no token', async (t) => {
  const restore = withBlobToken();
  try {
    mockEvents(t, ['some-other-event-id-0001']);
    const { POST } = await importRouteModule('unknown-event');
    const response = await POST(tokenRequest(PATH, JSON.stringify({ eventId: EVENT })));
    assert.equal(response.status, 400);
    assert.equal(JSON.stringify(await response.json()).includes('clientToken'), false);
  } finally {
    restore();
  }
});

test('paths outside the event folder, other file types and bad payloads get no token', async (t) => {
  const restore = withBlobToken();
  try {
    mockEvents(t, [EVENT, 'some-other-event-id-0001']);
    const { POST } = await importRouteModule('bad-paths');
    const payload = JSON.stringify({ eventId: EVENT });
    for (const [pathname, clientPayload] of [
      [`frames/${EVENT}/a.jpg`, payload],
      [`originals/some-other-event-id-0001/a.jpg`, payload],
      [`originals/${EVENT}/a.png`, payload],
      [`originals/${EVENT}/../a.jpg`, payload],
      [`originals/${EVENT}/sub/a.jpg`, payload],
      [PATH, JSON.stringify({})],
      [PATH, JSON.stringify({ eventId: '../../x' })],
      [PATH, 'not json'],
      [PATH, null],
    ] as Array<[string, string | null]>) {
      const response = await POST(tokenRequest(pathname, clientPayload));
      assert.equal(response.status, 400, `${pathname} ${clientPayload}`);
    }
  } finally {
    restore();
  }
});

test('anything but a token request is rejected before the SDK is involved', async (t) => {
  const restore = withBlobToken();
  try {
    mockEvents(t, [EVENT]);
    const { POST } = await importRouteModule('wrong-type');
    assert.equal((await POST(tokenRequest(PATH, JSON.stringify({ eventId: EVENT }), { type: 'blob.upload-completed' }))).status, 400);
    const noBody = new NextRequest('http://localhost/api/uploads/original', { method: 'POST', body: 'nope', headers: { 'x-forwarded-for': '198.51.100.250' } });
    assert.equal((await POST(noBody)).status, 400);
  } finally {
    restore();
  }
});

test('a missing storage token is a generic server error that leaks nothing', async (t) => {
  const previous = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const originalError = console.error;
  console.error = () => {};
  try {
    mockEvents(t, [EVENT]);
    const { POST } = await importRouteModule('no-token');
    const response = await POST(tokenRequest(PATH, JSON.stringify({ eventId: EVENT })));
    assert.equal(response.status, 500);
    assert.equal(JSON.stringify(await response.json()), JSON.stringify({ error: 'Could not prepare the upload' }));
  } finally {
    console.error = originalError;
    if (previous !== undefined) process.env.BLOB_READ_WRITE_TOKEN = previous;
  }
});

test('a flood from one address is cut off with 429', async (t) => {
  const restore = withBlobToken();
  try {
    mockEvents(t, [EVENT]);
    const { POST } = await importRouteModule('flood');
    let limited = 0;
    for (let i = 0; i < 35; i += 1) {
      const response = await POST(tokenRequest(PATH, JSON.stringify({ eventId: EVENT }), { ip: '203.0.113.77' }));
      if (response.status === 429) limited += 1;
    }
    assert.ok(limited > 0, 'expected 429 after the 30 per minute cap');
  } finally {
    restore();
  }
});
