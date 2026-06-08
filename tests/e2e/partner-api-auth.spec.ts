import { expect, test } from '@playwright/test';

type BootstrapPayload = {
  partnerId: string;
  partnerMongoId: string;
  eventMongoId: string;
  e2eRunId?: string;
};

async function devLoginApi(request: import('@playwright/test').APIRequestContext, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  const response = await request.get(`/api/auth/dev-login?${search.toString()}`);
  expect(response.ok()).toBeTruthy();
}

async function withBootstrap<T>(request: import('@playwright/test').APIRequestContext, fn: (payload: BootstrapPayload) => Promise<T>): Promise<T> {
  const bootstrap = await request.post('/api/e2e/bootstrap');
  expect(bootstrap.ok()).toBeTruthy();
  const bootstrapPayload = (await bootstrap.json()) as BootstrapPayload;
  expect(bootstrapPayload.e2eRunId?.trim()).toBeTruthy();

  try {
    return await fn(bootstrapPayload);
  } finally {
    if (bootstrapPayload.e2eRunId?.trim()) {
      const cleanupResponse = await request.post('/api/e2e/cleanup', {
        data: { e2eRunId: bootstrapPayload.e2eRunId },
      });
      expect(cleanupResponse.ok()).toBeTruthy();
    }
  }
}

test.describe('partner API authorization', () => {
  test('unauthenticated partner and frame reads are rejected', async ({ request }) => {
    await withBootstrap(request, async (bootstrapPayload) => {
      const partnerResponse = await request.get(`/api/partners/${bootstrapPayload.partnerMongoId}`);
      expect(partnerResponse.status()).toBe(401);

      const frameResponse = await request.get('/api/frames/000000000000000000000001');
      expect([401, 403, 404]).toContain(frameResponse.status());
      expect(frameResponse.status()).not.toBe(200);
    });
  });

  test('partner manager can read scoped partner detail but not global frames', async ({ request }) => {
    await withBootstrap(request, async (bootstrapPayload) => {
      await devLoginApi(request, {
        role: 'user',
        access: 'true',
        email: 'partner-events-manager@camera.local',
        name: 'Partner Events Manager',
        userId: 'e2e-partner-events-manager',
        redirectTo: '/admin/events',
      });

      const partnerResponse = await request.get(`/api/partners/${bootstrapPayload.partnerMongoId}`);
      expect(partnerResponse.ok()).toBeTruthy();

      const frameResponse = await request.get('/api/frames/000000000000000000000001');
      expect([401, 403, 404]).toContain(frameResponse.status());
      expect(frameResponse.status()).not.toBe(200);
    });
  });

  test('global admin can read partner detail', async ({ request }) => {
    await withBootstrap(request, async (bootstrapPayload) => {
      await devLoginApi(request, {
        role: 'admin',
        access: 'true',
        email: 'global-admin@camera.local',
        name: 'Global Admin',
        redirectTo: '/admin',
      });

      const partnerResponse = await request.get(`/api/partners/${bootstrapPayload.partnerMongoId}`);
      expect(partnerResponse.ok()).toBeTruthy();
    });
  });
});
