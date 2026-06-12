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

    await expect(page.getByRole('heading', { level: 3, name: 'Exports' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CSV' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'JSON' }).first()).toBeVisible();

    const supportedSections = [
      'all',
      'funnel',
      'hourly',
      'preset',
      'preset_performance',
      'garment',
      'event',
    ] as const;

    for (const section of supportedSections) {
      const jsonResponse = await page.request.get(`/api/admin/tryon-analytics/export?section=${section}&format=json`);
      expect(jsonResponse.ok()).toBeTruthy();
      expect(jsonResponse.headers()['content-disposition']).toContain(`tryon-analytics-${section === 'all' ? 'all' : section}`);

      const csvResponse = await page.request.get(`/api/admin/tryon-analytics/export?section=${section}&format=csv`);
      expect(csvResponse.ok()).toBeTruthy();
      expect(csvResponse.headers()['content-disposition']).toContain('.csv');
      const csvBody = await csvResponse.text();
      expect(csvBody.length).toBeGreaterThan(0);
    }

    const funnelPayload = await (await page.request.get('/api/admin/tryon-analytics/export?section=funnel&format=json')).json();
    expect(funnelPayload.data?.funnel).toBeTruthy();

    const hourlyCsv = await (await page.request.get('/api/admin/tryon-analytics/export?section=hourly&format=csv')).text();
    expect(hourlyCsv).toContain('hour,label,approved,declined,service,failed,total');

    const presetPerformanceAlias = await page.request.get('/api/admin/tryon-analytics/export?section=preset-performance&format=json');
    expect(presetPerformanceAlias.ok()).toBeTruthy();
    const presetPerformancePayload = await presetPerformanceAlias.json();
    expect(presetPerformancePayload.data?.presetPerformance).toBeTruthy();

    const invalidSection = await page.request.get('/api/admin/tryon-analytics/export?section=not-a-section');
    expect(invalidSection.status()).toBe(400);
  });
});
