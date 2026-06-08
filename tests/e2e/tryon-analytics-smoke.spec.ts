import { expect, test } from '@playwright/test';

async function devLogin(page: import('@playwright/test').Page) {
  await page.goto(
    '/api/auth/dev-login?role=admin&access=true&email=e2e-admin@camera.local&name=E2E+Admin&redirectTo=/admin'
  );
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('try-on analytics smoke', () => {
  test('analytics page and export contract load for global admin', async ({ page }) => {
    await devLogin(page);

    await page.goto('/admin/tryon/analytics');
    await expect(page.getByRole('heading', { level: 1, name: 'Try-On Analytics' })).toBeVisible();
    await expect(page.getByText('Pipeline funnel')).toBeVisible();

    const apiResponse = await page.request.get('/api/admin/tryon-analytics');
    expect(apiResponse.ok()).toBeTruthy();
    const payload = await apiResponse.json();
    expect(payload.data?.funnel).toBeTruthy();
    expect(payload.data?.totals).toBeTruthy();

    const exportResponse = await page.request.get('/api/admin/tryon-analytics/export?section=funnel&format=json');
    expect(exportResponse.ok()).toBeTruthy();
    const exportPayload = await exportResponse.json();
    expect(exportPayload.data?.funnel).toBeTruthy();

    const invalidSection = await page.request.get('/api/admin/tryon-analytics/export?section=not-a-section');
    expect(invalidSection.status()).toBe(400);
  });
});
