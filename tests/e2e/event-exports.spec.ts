/**
 * Event data export routes — access control + contract (GitHub #84).
 *
 * Covers /api/admin/events/[id]/export/emails and /export/images:
 * - unauthenticated → 401
 * - partner Events viewer → 403 (bulk PII export is manager-gated)
 * - authenticated user with no partner assignment → 403
 * - missing event → 404
 * - manager → 200 email CSV, deduplicated across submissions
 * - manager → 200 image CSV with the documented column contract
 * - manager → 400 ZIP export on an event with no images
 * - global admin → 200 (auto-allowed)
 *
 * Fixture facts (from /api/e2e/bootstrap):
 * - moderationEventMongoId has two submissions (original + tryon_result), both
 *   from e2e-user@camera.local → the email CSV must contain exactly one data
 *   row for that address with submissions=2.
 * - eventMongoId (the base E2E event) has no submissions → ZIP must 400.
 */

import { expect, test } from '@playwright/test';

type BootstrapPayload = {
  partnerId: string;
  partnerMongoId: string;
  eventMongoId: string;
  moderationEventMongoId: string;
  e2eRunId?: string;
};

type ApiRequest = import('@playwright/test').APIRequestContext;

async function devLoginApi(request: ApiRequest, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  const response = await request.get(`/api/auth/dev-login?${search.toString()}`);
  expect(response.ok()).toBeTruthy();
}

const MANAGER_LOGIN = {
  role: 'user',
  access: 'true',
  email: 'partner-events-manager@camera.local',
  name: 'Partner Events Manager',
  userId: 'e2e-partner-events-manager',
  redirectTo: '/admin/events',
};

const VIEWER_LOGIN = {
  role: 'user',
  access: 'true',
  email: 'partner-events-viewer@camera.local',
  name: 'Partner Events Viewer',
  userId: 'e2e-partner-events-viewer',
  redirectTo: '/admin/events',
};

const UNASSIGNED_LOGIN = {
  role: 'user',
  access: 'true',
  email: 'unassigned-user@camera.local',
  name: 'Unassigned User',
  userId: 'e2e-unassigned-user',
  redirectTo: '/',
};

async function withBootstrap<T>(request: ApiRequest, fn: (payload: BootstrapPayload) => Promise<T>): Promise<T> {
  const bootstrap = await request.post('/api/e2e/bootstrap');
  expect(bootstrap.ok()).toBeTruthy();
  const bootstrapPayload = (await bootstrap.json()) as BootstrapPayload;
  expect(bootstrapPayload.e2eRunId?.trim()).toBeTruthy();
  expect(bootstrapPayload.moderationEventMongoId?.trim()).toBeTruthy();

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

function csvLines(csv: string): string[] {
  return csv.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

test.describe('event export routes — authorization', () => {
  test('unauthenticated export requests are rejected', async ({ request }) => {
    await withBootstrap(request, async (payload) => {
      const emails = await request.get(`/api/admin/events/${payload.moderationEventMongoId}/export/emails`);
      expect(emails.status()).toBe(401);

      const images = await request.get(`/api/admin/events/${payload.moderationEventMongoId}/export/images`);
      expect(images.status()).toBe(401);
    });
  });

  test('partner viewer cannot run bulk exports (manager-gated)', async ({ request }) => {
    await withBootstrap(request, async (payload) => {
      await devLoginApi(request, VIEWER_LOGIN);

      const emails = await request.get(`/api/admin/events/${payload.moderationEventMongoId}/export/emails`);
      expect(emails.status()).toBe(403);

      const images = await request.get(`/api/admin/events/${payload.moderationEventMongoId}/export/images`);
      expect(images.status()).toBe(403);
    });
  });

  test('authenticated user without a partner assignment is rejected', async ({ request }) => {
    await withBootstrap(request, async (payload) => {
      await devLoginApi(request, UNASSIGNED_LOGIN);

      const emails = await request.get(`/api/admin/events/${payload.moderationEventMongoId}/export/emails`);
      expect(emails.status()).toBe(403);
    });
  });

  test('missing event returns 404 for a manager', async ({ request }) => {
    await withBootstrap(request, async () => {
      await devLoginApi(request, MANAGER_LOGIN);

      const emails = await request.get('/api/admin/events/ffffffffffffffffffffffff/export/emails');
      expect(emails.status()).toBe(404);
    });
  });
});

test.describe('event export routes — contract', () => {
  test('email CSV is deduplicated across submissions and follows the column contract', async ({ request }) => {
    await withBootstrap(request, async (payload) => {
      await devLoginApi(request, MANAGER_LOGIN);

      const response = await request.get(`/api/admin/events/${payload.moderationEventMongoId}/export/emails`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/csv');
      expect(response.headers()['content-disposition']).toContain('attachment');

      const lines = csvLines(await response.text());
      expect(lines[0]).toBe('email,name,source,submissions,first_submitted_at,last_submitted_at');

      const userRows = lines.filter((line) => line.toLowerCase().includes('e2e-user@camera.local'));
      // Two fixture submissions share the same address → exactly one deduplicated row.
      expect(userRows).toHaveLength(1);
      const columns = userRows[0].split(',');
      expect(columns[2]).toBe('sso');
      expect(Number(columns[3])).toBe(2);
    });
  });

  test('image CSV lists every submission image with the documented columns', async ({ request }) => {
    await withBootstrap(request, async (payload) => {
      await devLoginApi(request, MANAGER_LOGIN);

      const response = await request.get(`/api/admin/events/${payload.moderationEventMongoId}/export/images`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/csv');

      const lines = csvLines(await response.text());
      expect(lines[0]).toBe('submission_id,kind,submission_kind,url,user_email,user_name,created_at');
      // Both fixture submissions (original + tryon_result) must be represented.
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.some((line) => line.includes('original'))).toBeTruthy();
    });
  });

  test('ZIP export of an event with no images fails with 400, not a broken archive', async ({ request }) => {
    await withBootstrap(request, async (payload) => {
      await devLoginApi(request, MANAGER_LOGIN);

      const response = await request.get(`/api/admin/events/${payload.eventMongoId}/export/images?format=zip`);
      expect(response.status()).toBe(400);
    });
  });

  test('global admin is auto-allowed', async ({ request }) => {
    await withBootstrap(request, async (payload) => {
      await devLoginApi(request, {
        role: 'admin',
        access: 'true',
        email: 'global-admin@camera.local',
        name: 'Global Admin',
        redirectTo: '/admin',
      });

      const response = await request.get(`/api/admin/events/${payload.moderationEventMongoId}/export/emails`);
      expect(response.status()).toBe(200);
    });
  });
});
