import { expect, test } from '@playwright/test';

const SOURCE_ID = '0123456789abcdef01234567';
const STAMP = '2026-11-04T10:00:00.000Z';

function template(templateId: string, level: 'global' | 'event', ownerId: string | null, name: string) {
  return { templateId, level, ownerId, name, config: { customPages: [] }, createdAt: STAMP, updatedAt: STAMP };
}

test('global admin manages named journeys and explicitly changes the one global default', async ({ page }) => {
  let createdPayload: Record<string, unknown> | null = null;
  let globalDefault: string | null = null;
  const templates = [] as ReturnType<typeof template>[];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/dev-login') return route.continue();
    if (url.pathname === '/api/visual-assets/templates/default' && request.method() === 'GET') {
      return route.fulfill({ json: { data: {
        templateId: globalDefault,
        templates,
        sourceEvents: [{ _id: SOURCE_ID, name: 'Harbor City opening', partnerName: 'Harbor City', eventDate: '2026-10-16' }],
      } } });
    }
    if (url.pathname === '/api/visual-assets/templates' && request.method() === 'POST') {
      createdPayload = request.postDataJSON() as Record<string, unknown>;
      const result = template(`global-${templates.length + 1}`, 'global', null, String(createdPayload.name));
      templates.unshift(result);
      if (!globalDefault) globalDefault = result.templateId;
      return route.fulfill({ status: 201, json: { data: { template: result } } });
    }
    if (url.pathname === '/api/visual-assets/templates/default' && request.method() === 'PATCH') {
      globalDefault = String((request.postDataJSON() as { templateId: string }).templateId);
      return route.fulfill({ json: { data: { templateId: globalDefault } } });
    }
    return route.fulfill({ json: { data: {} } });
  });

  await page.goto('/api/auth/dev-login?role=admin&access=true&email=journey@camera.local&name=Journey%20Editor&userId=global-journey-e2e&redirectTo=%2Fadmin%2Fsettings%2Fexperience');
  await expect(page.getByRole('heading', { name: 'Global User Journey', level: 1 })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Create from' })).toHaveValue('Harbor City opening · Harbor City · 2026-10-16');
  await expect(page.getByLabel('Journey name')).toHaveValue('Global default journey');
  await expect(page.getByLabel('Journey name')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Create journey' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Create journey' }).click();
  await expect(page.getByText('Journey version created.')).toBeVisible();
  expect(createdPayload).toEqual({ level: 'global', name: 'Global default journey', sourceEventId: SOURCE_ID });
  await expect(page.getByText('Selected default', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set as default' })).toHaveCount(0);

  await page.getByLabel('Journey name').fill('Alternate journey');
  await expect(page.getByLabel('Journey name')).toHaveCount(1);
  await page.getByRole('button', { name: 'Create journey' }).click();
  await expect(page.getByRole('button', { name: 'Set as default' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Set as default' }).click();
  await expect(page.getByText('Journey default saved.')).toBeVisible();
  expect(globalDefault).toBe('global-2');
  await expect(page.getByText('Selected default', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('event manager selects one Event Journey and stable event links stay unchanged', async ({ page }) => {
  const eventId = 'abcdefabcdefabcdefabcdef';
  const captureUrl = `https://camera.messmass.com/capture/${eventId}`;
  const shortUrl = 'https://go.messmass.com/abc234';
  let selection: { mode: 'inherit' | 'template'; templateId?: string } = { mode: 'inherit' };
  let createdPayload: Record<string, unknown> | null = null;
  const templates = [template('event-summer', 'event', eventId, 'Event summer journey')];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/dev-login') return route.continue();
    if (url.pathname === `/api/events/${eventId}` && request.method() === 'GET') {
      const active = selection.mode === 'template' ? templates.find((item) => item.templateId === selection.templateId) : null;
      return route.fulfill({ json: { data: { event: {
        _id: eventId, eventId, name: 'Journey selection test', customPages: [], experienceTemplate: selection,
        effectiveExperienceTemplateId: active?.templateId ?? 'global-matchday', effectiveExperienceTemplateName: active?.name ?? 'Global matchday journey',
      } } } });
    }
    if (url.pathname === `/api/events/${eventId}/experience-template` && request.method() === 'GET') {
      const active = selection.mode === 'template' ? templates.find((item) => item.templateId === selection.templateId) : null;
      const parent = { templateId: 'global-matchday', name: 'Global matchday journey', level: 'global' as const };
      return route.fulfill({ json: { data: {
        selection,
        effectiveJourney: active ? { templateId: active.templateId, name: active.name, level: 'event' } : parent,
        inheritedJourney: parent,
        legacyJourney: false,
        selectionNeedsRepair: false,
        publicLinks: { captureUrl, shortUrl },
        templates,
        canCreateEventTemplate: true,
      } } });
    }
    if (url.pathname === '/api/visual-assets/templates' && request.method() === 'POST') {
      createdPayload = request.postDataJSON() as Record<string, unknown>;
      const result = template('event-created', 'event', eventId, String(createdPayload.name));
      templates.unshift(result);
      return route.fulfill({ status: 201, json: { data: { template: result } } });
    }
    if (url.pathname === `/api/events/${eventId}/experience-template` && request.method() === 'PATCH') {
      selection = (request.postDataJSON() as { selection: typeof selection }).selection;
      return route.fulfill({ json: { data: { selection } } });
    }
    return route.fulfill({ json: { data: {} } });
  });

  await page.goto(`/api/auth/dev-login?role=admin&access=true&email=journey-event@camera.local&name=Journey%20Editor&userId=journey-event-e2e&redirectTo=%2Fadmin%2Fevents%2F${eventId}%2Fpages`);
  await expect(page.getByRole('heading', { name: /Journey selection test.*Event User Journey/ })).toBeVisible();
  await expect(page.getByText('Currently live: Global matchday journey')).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(captureUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('href', captureUrl);
  await expect(page.getByRole('link', { name: new RegExp(shortUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('href', shortUrl);

  await page.getByRole('button', { name: 'Use for this event' }).click();
  await expect(page.getByText('Currently live: Event summer journey')).toBeVisible();
  expect(selection).toEqual({ mode: 'template', templateId: 'event-summer' });

  await page.getByLabel('Journey name').fill('Event-only version');
  await page.getByRole('button', { name: 'Create journey' }).click();
  await expect(page.getByText('Journey version created. Select it below to make it live.')).toBeVisible();
  expect(createdPayload).toEqual({ level: 'event', name: 'Event-only version', sourceEventId: eventId });
  await expect(page.getByRole('button', { name: 'Use for this event' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Use for this event' }).click();
  await expect(page.getByText('Currently live: Event-only version')).toBeVisible();

  await page.getByRole('button', { name: 'Use parent default' }).click();
  await expect(page.getByText('Currently live: Global matchday journey')).toBeVisible();
  expect(selection).toEqual({ mode: 'inherit' });
  await expect(page.getByRole('link', { name: new RegExp(captureUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('href', captureUrl);
  await expect(page.getByRole('link', { name: new RegExp(shortUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('href', shortUrl);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('legacy event pages stay live until a named Event Journey is created and selected', async ({ page }) => {
  const eventId = 'abcdefabcdefabcdefabcdef';
  let selection: { mode: 'inherit' | 'template'; templateId?: string } | null = null;
  let legacyJourney = true;
  const templates: ReturnType<typeof template>[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/dev-login') return route.continue();
    if (url.pathname === `/api/events/${eventId}` && request.method() === 'GET') {
      return route.fulfill({ json: { data: { event: { _id: eventId, eventId, name: 'Legacy journey', customPages: [{
        pageId: 'legacy-page', pageType: 'welcome', order: 0, isActive: true,
        config: { title: 'Existing welcome', description: 'Existing description', buttonText: 'Continue' },
      }] } } } });
    }
    if (url.pathname === `/api/events/${eventId}/experience-template` && request.method() === 'GET') {
      return route.fulfill({ json: { data: {
        selection, legacyJourney, selectionNeedsRepair: false,
        effectiveJourney: null,
        inheritedJourney: { templateId: 'global-matchday', name: 'Global matchday journey', level: 'global' },
        publicLinks: { captureUrl: `https://camera.messmass.com/capture/${eventId}`, shortUrl: null },
        templates, canCreateEventTemplate: true,
      } } });
    }
    if (url.pathname === '/api/visual-assets/templates' && request.method() === 'POST') {
      const body = request.postDataJSON() as { name: string };
      const result = template('legacy-snapshot', 'event', eventId, body.name);
      templates.push(result);
      return route.fulfill({ status: 201, json: { data: { template: result } } });
    }
    if (url.pathname === `/api/events/${eventId}/experience-template` && request.method() === 'PATCH') {
      selection = (request.postDataJSON() as { selection: typeof selection }).selection;
      legacyJourney = false;
      return route.fulfill({ json: { data: { selection } } });
    }
    return route.fulfill({ json: { data: {} } });
  });

  await page.goto(`/api/auth/dev-login?role=admin&access=true&email=legacy-journey@camera.local&name=Journey%20Editor&userId=legacy-journey-e2e&redirectTo=%2Fadmin%2Fevents%2F${eventId}%2Fpages`);
  await expect(page.getByText('Currently live: Existing event pages')).toBeVisible();
  await expect(page.getByText('They remain live until you select another journey. Create a named Event Journey from this setup, then select it below.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use parent default' })).toBeDisabled();
  await page.getByLabel('Journey name').fill('Preserved legacy flow');
  await page.getByRole('button', { name: 'Create journey' }).click();
  await expect(page.getByText('Journey version created. Select it below to make it live.')).toBeVisible();
  expect(legacyJourney).toBe(true);
  await page.getByRole('button', { name: 'Use for this event' }).click();
  await expect(page.getByText('Currently live: Preserved legacy flow')).toBeVisible();
  expect(selection).toEqual({ mode: 'template', templateId: 'legacy-snapshot' });
});
