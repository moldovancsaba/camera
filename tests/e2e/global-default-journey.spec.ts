import { expect, test } from '@playwright/test';

const SOURCE_ID = '0123456789abcdef01234567';
const STAMP = '2026-11-04T10:00:00.000Z';

function template(templateId: string, level: 'global' | 'event', ownerId: string | null, name: string) {
  return { templateId, level, ownerId, name, config: { customPages: [] as unknown[] }, createdAt: STAMP, updatedAt: STAMP };
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
  await expect(page.getByText('Journey version created and selected as this level’s default.')).toBeVisible();
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
  await expect(page.getByText('Inherited journey customized. This event now owns the selected copy.')).toBeVisible();
  expect(legacyJourney).toBe(true);
  await page.getByRole('button', { name: 'Use for this event' }).click();
  await expect(page.getByText('Currently live: Preserved legacy flow')).toBeVisible();
  expect(selection).toEqual({ mode: 'template', templateId: 'legacy-snapshot' });
});

test('event journey page moves keep their identity across hidden built-in rows, save, and reload', async ({ page }) => {
  const eventId = 'abcdefabcdefabcdefabcdef';
  const eventTemplate = template('event-reorder', 'event', eventId, 'Reorder test journey');
  const journeyPages = [
    { pageId: 'welcome-page', pageType: 'welcome', order: -1, isActive: true, config: { title: 'Welcome', description: '', buttonText: 'Start' } },
    { pageId: 'take-photo-page', pageType: 'take-photo', order: 0, isActive: true, config: { title: 'Take Photo', description: '', buttonText: 'Continue' } },
    { pageId: 'cta-page', pageType: 'cta', order: 1, isActive: true, config: { title: 'Visit club shop', description: '', buttonText: 'Open' } },
  ];
  eventTemplate.config.customPages = journeyPages;
  const selection = { mode: 'template' as const, templateId: eventTemplate.templateId };
  let savedTemplateConfig: Record<string, unknown> = structuredClone(eventTemplate.config);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/dev-login') return route.continue();
    if (url.pathname === `/api/events/${eventId}` && request.method() === 'GET') {
      return route.fulfill({ json: { data: { event: {
        _id: eventId,
        eventId,
        name: 'Journey order test',
        customPages: journeyPages,
        journeyContext: { vettingRequired: false, consentDefault: false, language: 'en', hasWelcomeScreen: false },
        experienceTemplate: selection,
        effectiveExperienceTemplateId: eventTemplate.templateId,
        effectiveExperienceTemplateName: eventTemplate.name,
      } } } });
    }
    if (url.pathname === `/api/events/${eventId}/experience-template` && request.method() === 'GET') {
      return route.fulfill({ json: { data: {
        selection,
        effectiveJourney: { templateId: eventTemplate.templateId, name: eventTemplate.name, level: 'event' },
        inheritedJourney: { templateId: 'global-matchday', name: 'Global matchday journey', level: 'global' },
        legacyJourney: false,
        selectionNeedsRepair: false,
        publicLinks: { captureUrl: `https://camera.messmass.com/capture/${eventId}`, shortUrl: null },
        templates: [{ ...eventTemplate, config: savedTemplateConfig }],
        canCreateEventTemplate: true,
      } } });
    }
    if (url.pathname === `/api/visual-assets/templates/${eventTemplate.templateId}` && request.method() === 'PATCH') {
      const body = request.postDataJSON() as { config: Record<string, unknown> };
      savedTemplateConfig = structuredClone(body.config);
      return route.fulfill({ json: { data: { template: { ...eventTemplate, config: savedTemplateConfig } } } });
    }
    return route.fulfill({ json: { data: {} } });
  });

  const journeyUrl = `/admin/events/${eventId}/pages`;
  const loginUrl = `/api/auth/dev-login?role=admin&access=true&email=journey-order@camera.local&name=Journey%20Editor&userId=journey-order-e2e&redirectTo=${encodeURIComponent(journeyUrl)}`;
  await page.goto(loginUrl);
  await expect(page.getByRole('heading', { name: /Journey order test.*Event User Journey/ })).toBeVisible();
  await page.getByRole('button', { name: 'Edit journey' }).click();
  const pageRows = page.locator('article');
  const rowsInOrder = async () => (await pageRows.allTextContents()).map((text) => text.trim());
  const pagePosition = (rows: string[], pageType: string) => rows.findIndex((text) => text.includes(pageType));
  const before = await rowsInOrder();
  const ctaIndex = pagePosition(before, 'ctaVisit club shop');
  const takePhotoIndex = pagePosition(before, 'take-photoTake Photo');
  expect(ctaIndex).toBeGreaterThan(takePhotoIndex);

  await pageRows.filter({ hasText: 'Visit club shop' }).getByTitle('Move up').click();
  const afterMove = await rowsInOrder();
  expect(pagePosition(afterMove, 'ctaVisit club shop')).toBeLessThan(pagePosition(afterMove, 'take-photoTake Photo'));
  await page.getByRole('button', { name: 'Save all' }).click();
  await expect.poll(() => (savedTemplateConfig.customPages as typeof journeyPages).find((item) => item.pageId === 'cta-page')?.order)
    .toBeLessThan((savedTemplateConfig.customPages as typeof journeyPages).find((item) => item.pageId === 'take-photo-page')!.order);

  await page.goto(loginUrl);
  await expect(page.getByRole('heading', { name: /Journey order test.*Event User Journey/ })).toBeVisible();
  await page.getByRole('button', { name: 'Edit journey' }).click();
  const afterReload = await rowsInOrder();
  expect(pagePosition(afterReload, 'ctaVisit club shop')).toBeLessThan(pagePosition(afterReload, 'take-photoTake Photo'));
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
