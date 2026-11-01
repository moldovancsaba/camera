import { expect, test } from '@playwright/test';

type BootstrapPayload = {
  e2eRunId?: string;
};

let bootstrapRunId = '';

async function devLogin(page: import('@playwright/test').Page, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  await page.goto(`/api/auth/dev-login?${search.toString()}`);
}

test.describe('admin access smoke', () => {
  test.beforeEach(async ({ request }) => {
    const bootstrap = await request.post('/api/e2e/bootstrap');
    expect(bootstrap.ok()).toBeTruthy();
    const bootstrapPayload = (await bootstrap.json()) as BootstrapPayload;
    bootstrapRunId = bootstrapPayload.e2eRunId?.trim() ?? '';
  });

  test.afterEach(async ({ request }) => {
    if (!bootstrapRunId) return;

    await request.post('/api/e2e/cleanup', {
      data: {
        e2eRunId: bootstrapRunId,
      },
    });
    bootstrapRunId = '';
  });

  test('global admin sees full admin navigation', async ({ page }) => {
    const sidebarNav = page.getByRole('navigation');

    await devLogin(page, {
      role: 'admin',
      access: 'true',
      email: 'global-admin@camera.local',
      name: 'Global Admin',
      userId: 'global-admin-access-smoke-e2e',
      redirectTo: '/admin',
    });

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(sidebarNav.locator('a[href="/admin"]')).toBeVisible();
    await expect(sidebarNav.locator('a[href="/admin/users"]')).toBeVisible();
    await expect(sidebarNav.locator('a[href="/admin/frames"]')).toBeVisible();
    await expect(sidebarNav.locator('a[href="/admin/landing-pages"]')).toBeVisible();
  });

  test('partner-scoped Events manager sees scoped dashboard and org surfaces without global inventory', async ({ page }) => {
    const sidebarNav = page.getByRole('navigation');

    await devLogin(page, {
      role: 'user',
      access: 'true',
      email: 'partner-events-manager@camera.local',
      name: 'Partner Events Manager',
      userId: 'e2e-partner-events-manager',
      redirectTo: '/admin/events',
    });

    await expect(page).toHaveURL(/\/admin\/events$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(sidebarNav.locator('a[href="/admin/partners"]')).toBeVisible();
    await expect(sidebarNav.locator('a[href="/admin/events"]')).toBeVisible();
    await expect(sidebarNav.locator('a[href="/admin"]')).toBeVisible();
    await expect(sidebarNav.locator('a[href="/admin/frames"]')).toHaveCount(0);
    await expect(sidebarNav.locator('a[href="/admin/users"]')).toHaveCount(0);
  });

  test('partner-scoped Events viewer can open events but not global users', async ({ page }) => {
    await devLogin(page, {
      role: 'user',
      access: 'true',
      email: 'partner-events-viewer@camera.local',
      name: 'Partner Events Viewer',
      userId: 'e2e-partner-events-viewer',
      redirectTo: '/admin/events',
    });

    await expect(page).toHaveURL(/\/admin\/events$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole('navigation').locator('a[href="/admin/users"]')).toHaveCount(0);
  });

  test('partner-scoped manager is redirected away from global users', async ({ page }) => {
    await devLogin(page, {
      role: 'user',
      access: 'true',
      email: 'partner-events-manager@camera.local',
      name: 'Partner Events Manager',
      userId: 'e2e-partner-events-manager',
      redirectTo: '/admin/users',
    });

    await expect(page).toHaveURL(/\/admin\/partners/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });
});
