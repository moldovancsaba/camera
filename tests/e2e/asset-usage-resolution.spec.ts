import { expect, test } from '@playwright/test';

const PICTURE_ID = 'asset-usage-e2e-picture';
const PARTNER_ID = '0123456789abcdef01234560';
const EVENT_ID = '0123456789abcdef01234561';

const firstPage = [
  {
    key: 'partner:partner-1:images',
    ownerLevel: 'partner',
    ownerId: PARTNER_ID,
    ownerName: 'Test Partner',
    uses: ['In the partner library'],
    href: `/admin/partners/${PARTNER_ID}/images`,
  },
  {
    key: 'event:event-1:edit',
    ownerLevel: 'event',
    ownerId: EVENT_ID,
    ownerName: 'Test Event',
    uses: ['Sample selfie slot'],
    href: `/admin/events/${EVENT_ID}/edit`,
  },
];

test('a blocked asset delete lists exact destinations, supports pagination, and avoids a duplicate error notice', async ({ page }) => {
  const usageOffsets: number[] = [];
  let deleteRequests = 0;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;

    if (pathname === '/api/auth/dev-login') {
      await route.continue();
      return;
    }

    if (pathname === '/api/images' && request.method() === 'GET') {
      await route.fulfill({
        json: {
          data: {
            items: [{
              id: PICTURE_ID,
              kind: 'images',
              name: 'Test campaign image',
              description: '',
              imageUrl: null,
              thumbnailUrl: null,
              scope: 'global',
              itemActive: true,
              shareToChildren: true,
              createdAt: null,
              messageArea: null,
              owner: null,
            }],
          },
        },
      });
      return;
    }

    if (pathname === `/api/images/${PICTURE_ID}` && request.method() === 'DELETE') {
      deleteRequests += 1;
      await route.fulfill({
        status: 409,
        json: {
          error: 'This image is still used in 1 partner, 1 event.',
          details: { kind: 'images', assetId: PICTURE_ID, usages: firstPage, total: 3, truncated: true },
        },
      });
      return;
    }

    if (pathname === `/api/visual-assets/images/${PICTURE_ID}/usages` && request.method() === 'GET') {
      const offset = Number(searchParams.get('offset') ?? '0');
      usageOffsets.push(offset);
      const usages = offset === 0 ? firstPage : [
        {
          key: 'event:event-2:edit',
          ownerLevel: 'event',
          ownerId: EVENT_ID,
          ownerName: 'Second Test Event',
          uses: ['Welcome screen image'],
          href: `/admin/events/${EVENT_ID}/edit`,
        },
      ];
      await route.fulfill({
        json: {
          data: {
            assetId: PICTURE_ID,
            kind: 'images',
            usages,
            total: 3,
            truncated: offset === 0,
            copySourceUrl: 'https://camera.example.test/copy.png',
            assetName: 'Test campaign image',
          },
        },
      });
      return;
    }

    await route.fulfill({ json: { data: {} } });
  });

  await page.addInitScript(() => {
    localStorage.setItem('camera-tour:admin:v1', '{"status":"skipped","at":"e2e"}');
  });
  await page.goto(`/api/auth/dev-login?role=admin&access=true&email=asset-usage@camera.local&name=Asset%20Editor&userId=asset-usage-e2e&redirectTo=%2Fadmin%2Fimages`);
  await expect(page.getByRole('heading', { name: 'Global Images' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete from the library' }).click();
  const confirmDialog = page.getByRole('dialog', { name: 'Delete global image' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Delete' }).click();

  const panel = page.locator('section[aria-labelledby="asset-usage-resolution-title"]');
  await expect(panel.getByRole('heading', { name: 'This asset is still used' })).toBeVisible();
  await expect(panel.getByText('Showing 2 of 3 uses.')).toBeVisible();
  await expect(panel.getByText('Test Partner', { exact: true })).toBeVisible();
  await expect(panel.getByText('Test Event', { exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: /Open partner settings for Test Partner/ })).toHaveAttribute('target', '_blank');
  await expect(panel.getByRole('link', { name: /Open event settings for Test Event/ })).toHaveAttribute('target', '_blank');
  await expect(panel.getByRole('link', { name: /Open Test campaign image source file/ })).toHaveAttribute('target', '_blank');
  await expect(panel.getByRole('button', { name: 'Load more asset uses' })).toBeVisible();
  await expect(page.getByText('Delete failed')).toHaveCount(0);
  await expect(page.getByText('That did not work')).toHaveCount(0);

  await panel.getByRole('button', { name: 'Load more asset uses' }).click();
  await expect(panel.getByText('Showing 3 of 3 uses.')).toBeVisible();
  await expect(panel.getByText('Second Test Event', { exact: true })).toBeVisible();
  await expect.poll(() => usageOffsets).toEqual([0, 2]);
  expect(deleteRequests).toBe(1);
});
