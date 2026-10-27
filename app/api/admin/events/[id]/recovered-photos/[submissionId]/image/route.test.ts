import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import type { GetCommandOptions } from '@vercel/blob';
import { COLLECTIONS } from '@/lib/db/schemas';
import { fakeDb } from '@/lib/library/fake-db';

const apiReal = await import('@/lib/api');
type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

test('reads an erased recovery photo using the Function request OIDC token', async (t: TestContext) => {
  const eventMongoId = new ObjectId();
  const submissionId = new ObjectId();
  const previousStoreId = process.env.CAMERA_MTK_RECOVERY_STORE_ID;
  const previousOidcToken = process.env.VERCEL_OIDC_TOKEN;
  process.env.CAMERA_MTK_RECOVERY_STORE_ID = 'private-recovery-store';
  delete process.env.VERCEL_OIDC_TOKEN;
  t.after(() => {
    if (previousStoreId === undefined) delete process.env.CAMERA_MTK_RECOVERY_STORE_ID;
    else process.env.CAMERA_MTK_RECOVERY_STORE_ID = previousStoreId;
    if (previousOidcToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = previousOidcToken;
  });

  const seeded = fakeDb({
    [COLLECTIONS.EVENTS]: [{ _id: eventMongoId, eventId: 'mtk-event' }],
    [COLLECTIONS.SUBMISSIONS]: [{
      _id: submissionId,
      eventId: 'mtk-event',
      consentStatus: 'expired',
      retentionStatus: 'erased',
      adminRecovery: {
        state: 'available',
        store: 'camera-mtk-recovery',
        pathname: `camera-admin-recovery/mtk/${submissionId}.jpg`,
      },
    }],
  });

  let blobOptions: GetCommandOptions | undefined;
  const expectedBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  t.mock.module('@vercel/blob', {
    exports: {
      get: async (_pathname: string, options: GetCommandOptions) => {
        blobOptions = options;
        return {
          statusCode: 200 as const,
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(expectedBytes);
              controller.close();
            },
          }),
          headers: new Headers(),
          blob: { url: 'https://private.test/image.jpg', downloadUrl: 'https://private.test/image.jpg', pathname: 'image.jpg', contentDisposition: 'inline', cacheControl: 'private', uploadedAt: new Date(), etag: 'etag', contentType: 'image/jpeg', size: expectedBytes.length },
        };
      },
    },
  });
  t.mock.module('@/lib/api', {
    exports: {
      ...apiReal,
      requireAuth: async () => ({ user: { id: 'manager-1' }, appRole: 'admin' }),
    },
  });
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/partners/authorization', {
    exports: { assertGlobalAdminOrPartnerEventAccess: async () => ({ role: 'manager', partnerId: 'partner-1' }) },
  });

  const { GET } = await importRoute('runtime-oidc-header');
  const response = await GET(
    new NextRequest(`https://camera.test/api/admin/events/${eventMongoId}/recovered-photos/${submissionId}/image`, {
      headers: { 'x-vercel-oidc-token': 'runtime-oidc-token' },
    }),
    { params: Promise.resolve({ id: String(eventMongoId), submissionId: String(submissionId) }) },
  );

  assert.equal(response.status, 200);
  assert.equal(blobOptions?.oidcToken, 'runtime-oidc-token');
  assert.equal(blobOptions?.storeId, 'private-recovery-store');
  assert.equal(blobOptions?.useCache, false);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expectedBytes);
});
