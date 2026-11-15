import { expect, test } from '@playwright/test';

const EVENT_ID = '0123456789abcdef01234567';
const WELCOME_PAGE = {
  pageId: 'default-welcome',
  pageType: 'welcome',
  order: -1,
  isActive: true,
  config: { title: 'Welcome', buttonText: 'Start' },
  createdAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
};

test('welcome journey makes the slideshow source and page-only image replacement discoverable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/dev-login') {
      await route.continue();
      return;
    }
    if (url.pathname === `/api/events/${EVENT_ID}` && request.method() === 'GET') {
      await route.fulfill({
        json: {
          data: {
            event: {
              _id: EVENT_ID,
              eventId: EVENT_ID,
              name: 'Image replacement test',
              customPages: [WELCOME_PAGE],
              welcomeScreen: { url: 'https://images.example.test/default-welcome.png' },
            },
          },
        },
      });
      return;
    }
    if (url.pathname === `/api/events/${EVENT_ID}/library` && url.searchParams.get('kind') === 'images') {
      await route.fulfill({ json: { data: { available: [{ id: 'partner-image', name: 'Partner campaign image', imageUrl: 'https://images.example.test/partner.png', itemActive: true, scope: 'partner' }] } } });
      return;
    }
    await route.fulfill({ json: { data: {} } });
  });

  await page.goto(`/api/auth/dev-login?role=admin&access=true&email=welcome-image@camera.local&name=Welcome%20Editor&userId=welcome-image-e2e&redirectTo=%2Fadmin%2Fevents%2F${EVENT_ID}%2Fpages`);
  await expect(page.getByRole('heading', { name: /Image replacement test.*User Journey/ })).toBeVisible();
  const welcomeRow = page.locator('article').filter({ hasText: 'Welcome' }).first();
  await welcomeRow.getByRole('button', { name: 'Edit' }).click();

  await expect(page.getByText(/generated from the event’s default slideshow/i)).toBeVisible();
  const slideshowLink = page.getByRole('link', { name: 'Open Event Slideshows' });
  await expect(slideshowLink).toHaveAttribute('href', `/admin/events/${EVENT_ID}#slideshows`);

  await page.getByRole('button', { name: 'Choose or upload a different image' }).click();
  await expect(page.locator('[data-image-picker-library]')).toBeVisible();
  await expect(page.getByText('Partner campaign image')).toBeVisible();
  const activePicker = page.locator('[data-image-picker]').filter({ has: page.locator('[data-image-picker-library]') });
  await activePicker.getByRole('button', { name: 'Upload here' }).click();
  await expect(page.locator('[data-image-picker-upload]')).toBeVisible();
  await expect(page.getByLabel('Image name')).toBeVisible();
  await page.getByRole('button', { name: 'Keep the current slideshow image' }).click();
  await expect(page.getByText(/generated from the event’s default slideshow/i)).toBeVisible();
  await expect(page.locator('[data-image-picker-library], [data-image-picker-upload]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Choose or upload a different image' }).click();
  await page.getByRole('button', { name: 'Use this picture' }).click();
  await expect(page.locator('input[name^="picture-address-"]').last()).toHaveValue('https://images.example.test/partner.png');
  await expect(page.getByText(/generated from the event’s default slideshow/i)).toHaveCount(0);
});
