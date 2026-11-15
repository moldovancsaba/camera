import { expect, test } from '@playwright/test';

const EVENT_ID = '0123456789abcdef01234567';
const EVENT_MESSAGES = ['Hajrá, MTK!'];
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp8sAAAAASUVORK5CYII=',
  'base64',
);

test('event frame upload keeps chooser name separate from an existing or newly added printed message', async ({ page }) => {
  const uploads: string[] = [];
  const currentMessages = [...EVENT_MESSAGES];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;

    if (pathname === '/api/auth/dev-login') {
      await route.continue();
      return;
    }
    if (pathname === '/api/admin/nav-context') {
      await route.fulfill({ json: { data: { name: 'Test event' } } });
      return;
    }
    if (pathname === `/api/events/${EVENT_ID}` && request.method() === 'GET') {
      await route.fulfill({ json: { data: { event: { name: 'Test event', generatedFrameEnabled: false } } } });
      return;
    }
    if (pathname === `/api/events/${EVENT_ID}/library` && searchParams.get('kind') === 'frames') {
      await route.fulfill({
        json: {
          data: {
            kind: 'frames',
            partner: { partnerId: 'test-partner', adminId: 'test-partner-admin', name: 'Test partner' },
            assigned: [],
            available: [],
            inactiveOwn: [],
            missing: [],
          },
        },
      });
      return;
    }
    if (pathname === `/api/admin/events/${EVENT_ID}/frame-design`) {
      await route.fulfill({
        json: {
          data: {
            frameDesign: null,
            generatedFrameEnabled: false,
            defaultMessages: currentMessages,
            limits: { maxMessages: 10, maxLength: 80, maxImages: 40 },
            availableFrames: [],
            inheritedSlots: { slots: null, source: 'built-in' },
          },
        },
      });
      return;
    }
    if (pathname === `/api/admin/events/${EVENT_ID}/frame-slots` && request.method() === 'GET') {
      await route.fulfill({ json: { data: { slots: null, inherited: null, messages: EVENT_MESSAGES, sampleEvent: null, followers: 0 } } });
      return;
    }
    if (pathname === `/api/admin/events/${EVENT_ID}/frame-slots/preview`) {
      await route.fulfill({ json: { data: { imageDataUrl: `data:image/png;base64,${PNG.toString('base64')}`, width: 1, height: 1, notes: [], message: EVENT_MESSAGES[0] } } });
      return;
    }
    if (pathname === `/api/events/${EVENT_ID}/library/upload` && request.method() === 'POST') {
      const body = request.postDataBuffer()?.toString('utf8') ?? '';
      uploads.push(body);
      if (body.includes('frameMessageMode') && body.includes('new') && body.includes('Szívem kék-fehér!')) {
        currentMessages.push('Szívem kék-fehér!');
      }
      await route.fulfill({
        status: 201,
        json: { data: { item: {}, assignment: {}, messageSetup: { message: 'Hajrá, MTK!', status: 'needs-generation' } } },
      });
      return;
    }

    await route.fulfill({ json: { data: {} } });
  });

  await page.goto(`/api/auth/dev-login?role=admin&access=true&email=frame-upload@camera.local&name=Frame%20Editor&userId=frame-upload-e2e&redirectTo=%2Fadmin%2Fevents%2F${EVENT_ID}%2Fframes`);
  await expect(page.getByRole('heading', { name: 'Manage Event Frames' })).toBeVisible();

  const form = page.locator('form').filter({ has: page.getByLabel('Frame name users see in the chooser') });
  const file = form.locator('input[type="file"]');
  const messagePicker = form.getByRole('textbox', { name: 'Printed message' });
  await expect(messagePicker).toBeVisible();

  await file.setInputFiles({ name: 'blue-frame.png', mimeType: 'image/png', buffer: PNG });
  await form.getByLabel('Frame name users see in the chooser').fill('Blue match frame');
  await messagePicker.click();
  await page.getByRole('option', { name: 'Use existing: Hajrá, MTK!' }).click();
  await form.locator('button[type="submit"]').click();
  await expect(page.getByText('The message was saved and linked. Generate the default frame when you are ready to use it.')).toBeVisible();
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0]).toContain('name');
  expect(uploads[0]).toContain('Blue match frame');
  expect(uploads[0]).toContain('frameMessageMode');
  expect(uploads[0]).toContain('existing');
  expect(uploads[0]).toContain('Hajrá, MTK!');

  await expect(form.getByLabel('Frame name users see in the chooser')).toHaveValue('');
  await expect(messagePicker).toBeVisible();
  await file.setInputFiles({ name: 'pink-frame.png', mimeType: 'image/png', buffer: PNG });
  await form.getByLabel('Frame name users see in the chooser').fill('Pink match frame');
  await messagePicker.click();
  await page.getByRole('option', { name: 'Add a new message…' }).click();
  await form.getByLabel('New event message').fill('Szívem kék-fehér!');
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => uploads.length).toBe(2);
  expect(uploads[1]).toContain('Pink match frame');
  expect(uploads[1]).toContain('frameMessageMode');
  expect(uploads[1]).toContain('new');
  expect(uploads[1]).toContain('Szívem kék-fehér!');
  await messagePicker.click();
  await expect(page.getByRole('option', { name: 'Use existing: Szívem kék-fehér!' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Frame name users see in the chooser')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Printed message' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
