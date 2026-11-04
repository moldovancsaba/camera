import { expect, test } from '@playwright/test';

const SOURCE_ID = '0123456789abcdef01234567';

test('global admin creates a journey version without publishing it, then explicitly selects it at mobile width', async ({ page }) => {
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
    if (url.pathname === '/api/visual-assets/templates/default' && request.method() === 'PATCH') {
      await route.fulfill({ json: { data: { templateId: 'global-default-e2e' } } });
      return;
    }
    await route.fulfill({ json: { data: {} } });
  });

  await page.goto('/api/auth/dev-login?role=admin&access=true&email=journey@camera.local&name=Journey%20Editor&userId=global-journey-e2e&redirectTo=%2Fadmin%2Fsettings%2Fexperience');
  await expect(page.getByRole('heading', { name: 'Global User Journey', level: 1 })).toBeVisible();
  const sourceEvent = page.getByRole('textbox', { name: 'Source event' });
  await expect(sourceEvent).toHaveValue('MTK Budapest x Vasas FC · MTK Budapest · 2026-10-16');
  await expect(page.getByLabel('Journey name')).toHaveValue('Global default journey');

  await page.getByRole('button', { name: 'Create journey version' }).click();
  await expect(page.getByText('Journey version created')).toBeVisible();
  expect(createdPayload).toEqual({ level: 'global', name: 'Global default journey', sourceEventId: SOURCE_ID });
  const selector = page.getByRole('textbox', { name: 'Experience defaults' });
  await expect(selector).toHaveValue('Disable inherited experience');
  await selector.click();
  await page.getByRole('option', { name: 'Global default journey' }).click();
  await page.getByRole('button', { name: 'Save choice' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('event manager selects the journey used by the event capture and short URLs', async ({ page }) => {
  const eventId = 'abcdefabcdefabcdefabcdef';
  const captureUrl = `https://camera.messmass.com/capture/${eventId}`;
  const shortUrl = 'https://go.messmass.com/abc234';
  let savedSelection: unknown = null;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/dev-login') {
      await route.continue();
      return;
    }
    if (url.pathname === `/api/events/${eventId}` && request.method() === 'GET') {
      await route.fulfill({ json: { data: { event: {
        _id: eventId,
        eventId,
        name: 'Journey selection test',
        customPages: [],
        experienceTemplate: { mode: 'inherit' },
        effectiveExperienceTemplateId: 'global-matchday',
        effectiveExperienceTemplateName: 'Global matchday journey',
      } } } });
      return;
    }
    if (url.pathname === `/api/events/${eventId}/experience-template` && request.method() === 'GET') {
      await route.fulfill({ json: { data: {
        selection: { mode: 'inherit' },
        effectiveJourney: { templateId: 'global-matchday', name: 'Global matchday journey', level: 'global' },
        inheritedJourney: { templateId: 'global-matchday', name: 'Global matchday journey', level: 'global' },
        publicLinks: { captureUrl, shortUrl },
        templates: [{
          templateId: 'event-summer', level: 'event', ownerId: eventId, name: 'Event summer journey', config: { customPages: [] },
          createdAt: '2026-11-04T10:00:00.000Z', updatedAt: '2026-11-04T10:00:00.000Z',
        }],
        canCreateTemplateLevels: ['event'],
      } } });
      return;
    }
    if (url.pathname === `/api/events/${eventId}/experience-template` && request.method() === 'PATCH') {
      savedSelection = request.postDataJSON().selection;
      await route.fulfill({ json: { data: { selection: savedSelection } } });
      return;
    }
    await route.fulfill({ json: { data: {} } });
  });

  await page.goto(`/api/auth/dev-login?role=admin&access=true&email=journey-event@camera.local&name=Journey%20Editor&userId=journey-event-e2e&redirectTo=%2Fadmin%2Fevents%2F${eventId}%2Fpages`);
  await expect(page.getByRole('heading', { name: /Journey selection test.*Event User Journey/ })).toBeVisible();
  await expect(page.getByText('Currently live: Global matchday journey')).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(captureUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('href', captureUrl);
  await expect(page.getByRole('link', { name: new RegExp(shortUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('href', shortUrl);

  const selector = page.getByRole('textbox', { name: 'Journey shown to event guests' });
  await selector.click();
  await page.getByRole('option', { name: 'Event summer journey' }).click();
  await page.getByRole('button', { name: 'Save choice' }).click();
  await expect(page.getByText('Currently live: Event summer journey')).toBeVisible();
  expect(savedSelection).toEqual({ mode: 'template', templateId: 'event-summer' });

  await selector.click();
  await page.getByRole('option', { name: 'Use this event’s own pages' }).click();
  await page.getByRole('button', { name: 'Save choice' }).click();
  await expect(page.getByText('Currently live: This event’s own pages')).toBeVisible();
  expect(savedSelection).toEqual({ mode: 'template', templateId: null });
  await expect(page.getByRole('link', { name: new RegExp(captureUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('href', captureUrl);
  await expect(page.getByRole('link', { name: new RegExp(shortUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('href', shortUrl);
});
