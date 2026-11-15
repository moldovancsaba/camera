import { expect, test } from '@playwright/test';

type BootstrapPayload = { e2eRunId?: string; eventMongoId?: string; partnerMongoId?: string };

let bootstrapRunId = '';

test('event managers can toggle visibility from the event card at desktop and mobile sizes', async ({ page, request }) => {
  const bootstrap = await request.post('/api/e2e/bootstrap');
  expect(bootstrap.ok()).toBeTruthy();
  const payload = (await bootstrap.json()) as BootstrapPayload;
  bootstrapRunId = payload.e2eRunId?.trim() ?? '';
  const eventMongoId = payload.eventMongoId?.trim() ?? '';
  const partnerMongoId = payload.partnerMongoId?.trim() ?? '';
  expect(eventMongoId).toBeTruthy();
  expect(partnerMongoId).toBeTruthy();

  try {
    const login = new URLSearchParams({
      role: 'admin',
      access: 'true',
      email: 'event-status@camera.local',
      name: 'Event Status Manager',
      userId: 'event-status-toggle-e2e',
      redirectTo: '/admin/events?search=E2E%20Event%20Instance',
    });
    await page.goto(`/api/auth/dev-login?${login.toString()}`);
    await expect(page).toHaveURL(/\/admin\/events\?search=/);
    let failNextStatusUpdate = false;
    await page.route(`**/api/events/${eventMongoId}`, async (route) => {
      if (route.request().method() === 'PATCH' && failNextStatusUpdate) {
        failNextStatusUpdate = false;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'test failure' }) });
        return;
      }
      await route.continue();
    });

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      const statusButton = page.getByRole('button', { name: /event: E2E Event Instance/i });
      await expect(statusButton).toBeVisible();
      await expect(statusButton).toHaveAccessibleName(/event: E2E Event Instance/i);
      expect((await statusButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (width === 390) expect((await statusButton.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);

      const originalState = await statusButton.getAttribute('aria-pressed');
      expect(originalState).toMatch(/^(true|false)$/);
      await statusButton.click();
      await expect(statusButton).toHaveAttribute('aria-pressed', originalState === 'true' ? 'false' : 'true');
      await statusButton.click();
      await expect(statusButton).toHaveAttribute('aria-pressed', originalState!);

      failNextStatusUpdate = true;
      const failedPatch = page.waitForResponse((response) => {
        return new URL(response.url()).pathname === `/api/events/${eventMongoId}`
          && response.request().method() === 'PATCH';
      });
      await statusButton.click();
      expect((await failedPatch).status()).toBe(500);
      await expect(statusButton).toHaveAttribute('aria-pressed', originalState!);
      await expect(statusButton).toBeEnabled();
    }

    await page.goto(`/admin/partners/${partnerMongoId}`);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const partnerEventStatus = page.getByRole('button', { name: /event: E2E Event Instance/i });
      await expect(partnerEventStatus).toBeVisible();
      expect((await partnerEventStatus.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      const originalState = await partnerEventStatus.getAttribute('aria-pressed');
      expect(originalState).toMatch(/^(true|false)$/);
      await partnerEventStatus.click();
      await expect(partnerEventStatus).toHaveAttribute('aria-pressed', originalState === 'true' ? 'false' : 'true');
      await partnerEventStatus.click();
      await expect(partnerEventStatus).toHaveAttribute('aria-pressed', originalState!);
    }

    expect(eventMongoId).toMatch(/^[a-f\d]{24}$/i);
  } finally {
    if (bootstrapRunId) {
      await request.post('/api/e2e/cleanup', { data: { e2eRunId: bootstrapRunId } });
      bootstrapRunId = '';
    }
  }
});
