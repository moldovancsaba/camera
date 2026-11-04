import { expect, test } from '@playwright/test';

const SOURCE_ID = '0123456789abcdef01234567';

test('global admin can create the sanitized default journey from the accepted MTK event at mobile width', async ({ page }) => {
  let createdPayload: Record<string, unknown> | null = null;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/dev-login') {
      await route.continue();
      return;
    }
    if (url.pathname === '/api/visual-assets/templates/default' && request.method() === 'GET') {
      await route.fulfill({
        json: {
          data: {
            templateId: null,
            templates: [],
            sourceEvents: [{ _id: SOURCE_ID, name: 'MTK Budapest x Vasas FC', partnerName: 'MTK Budapest', eventDate: '2026-10-16' }],
          },
        },
      });
      return;
    }
    if (url.pathname === '/api/visual-assets/templates' && request.method() === 'POST') {
      createdPayload = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        json: {
          data: {
            template: {
              templateId: 'global-default-e2e', level: 'global', ownerId: null,
              name: 'Global default journey', config: { customPages: [] },
              createdAt: '2026-11-04T10:00:00.000Z', updatedAt: '2026-11-04T10:00:00.000Z',
            },
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { data: {} } });
  });

  await page.goto('/api/auth/dev-login?role=admin&access=true&email=journey@camera.local&name=Journey%20Editor&userId=global-journey-e2e&redirectTo=%2Fadmin%2Fsettings%2Fexperience');
  await expect(page.getByRole('heading', { name: 'Global User Journey', level: 1 })).toBeVisible();
  const sourceEvent = page.getByRole('textbox', { name: 'Source event' });
  await expect(sourceEvent).toHaveValue('MTK Budapest x Vasas FC · MTK Budapest · 2026-10-16');
  await expect(page.getByLabel('Journey name')).toHaveValue('Global default journey');

  await page.getByRole('button', { name: 'Set as global default journey' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  expect(createdPayload).toEqual({ level: 'global', name: 'Global default journey', sourceEventId: SOURCE_ID, makeDefault: true });
  await expect(page.getByLabel('Journey version name')).toHaveValue('Global default journey');
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
