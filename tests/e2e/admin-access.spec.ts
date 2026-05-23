import { expect, test } from '@playwright/test';

async function devLogin(page: import('@playwright/test').Page, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  await page.goto(`/api/auth/dev-login?${search.toString()}`);
}

test.describe('admin access smoke', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/e2e/bootstrap');
  });

  test('global admin sees full admin navigation', async ({ page }) => {
    const sidebarNav = page.getByRole('navigation');

    await devLogin(page, {
      role: 'admin',
      access: 'true',
      email: 'global-admin@camera.local',
      name: 'Global Admin',
      redirectTo: '/admin',
    });

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Users' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Global Frames' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Landing Pages' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Gym App' })).toBeVisible();
  });

  test('partner-scoped Events manager sees partner and events surfaces without global inventory', async ({ page }) => {
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
    await expect(page.getByRole('heading', { level: 1, name: 'Events App' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Partners' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Events App' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Global Frames' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Users' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Gym App' })).toHaveCount(0);
  });

  test('partner-scoped Gym viewer reaches Gym surfaces without Events inventory', async ({ page }) => {
    const sidebarNav = page.getByRole('navigation');

    await devLogin(page, {
      role: 'user',
      access: 'true',
      email: 'partner-gym-viewer@camera.local',
      name: 'Partner Gym Viewer',
      userId: 'e2e-partner-gym-viewer',
      redirectTo: '/admin/gym',
    });

    await expect(page).toHaveURL(/\/admin\/gym$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Gym App' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Gym App' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Events App' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Global Galleries' })).toHaveCount(0);
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
    await expect(page.getByRole('heading', { level: 1, name: 'Partners' })).toBeVisible();
  });
});
