import { expect, test, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ADMIN_PAGES = resolve(process.cwd(), 'app/admin');
const OOPS = 'Oops! Something went wrong';
const INVALID_OBJECT_ID = 'ffffffffffffffffffffffff';

type BootstrapPayload = {
  e2eRunId?: string;
  eventMongoId?: string;
  partnerMongoId?: string;
};

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.isFile() && entry.name === 'page.tsx' ? [path] : [];
  });
}

function routeForPage(file: string, fixtures: Required<Pick<BootstrapPayload, 'eventMongoId' | 'partnerMongoId'>>): string {
  const segments = relative(ADMIN_PAGES, file).split(/[\\/]/).slice(0, -1);
  const route = segments.map((segment, index) => {
    if (segment !== '[id]') return segment.replace(/^\[(.+)\]$/, (_, name: string) => {
      if (name === 'landingPageId' || name === 'layoutMongoId' || name === 'slideshowId') return INVALID_OBJECT_ID;
      return INVALID_OBJECT_ID;
    });
    const parent = segments[index - 1];
    if (parent === 'events') return fixtures.eventMongoId;
    if (parent === 'partners') return fixtures.partnerMongoId;
    return INVALID_OBJECT_ID;
  });
  return `/admin/${route.join('/')}`;
}

async function loginAsGlobalAdmin(page: Page) {
  const search = new URLSearchParams({
    role: 'admin',
    access: 'true',
    email: 'ui-consistency-admin@camera.local',
    name: 'UI Consistency Admin',
    userId: `ui-consistency-admin-e2e-${Date.now()}`,
    redirectTo: '/admin',
  });
  await page.goto(`/api/auth/dev-login?${search.toString()}`);
  await expect(page).toHaveURL(/\/admin$/);
}

async function assertNoVisibleAdminControlsWithoutBorders(page: Page, path: string) {
  const unnamedControls = await page.locator(
    '[data-camera-admin] button:visible, [data-camera-admin] a[href]:visible, [data-camera-admin] input:not([type="hidden"]):visible, [data-camera-admin] select:visible, [data-camera-admin] textarea:visible, [data-camera-admin] [role="button"]:visible, [data-camera-admin] [role="combobox"]:visible'
  ).evaluateAll((elements) => elements.flatMap((element) => {
    if (element.closest('[aria-hidden="true"]')) return [];
    const labelledBy = element.getAttribute('aria-labelledby')
      ?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    const name = element.getAttribute('aria-label') || labelledBy || element.getAttribute('title') ||
      (element instanceof HTMLInputElement ? element.labels?.[0]?.textContent?.trim() : '') ||
      Array.from(element.querySelectorAll('img[alt], svg title')).map((child) =>
        child instanceof HTMLImageElement ? child.alt : child.textContent?.trim() ?? ''
      ).filter(Boolean).join(' ') ||
      element.textContent?.trim().replace(/\s+/g, ' ');
    return name ? [] : [{ tag: element.tagName, type: element.getAttribute('type'), role: element.getAttribute('role') }];
  }));
  expect(unnamedControls, `${path}: visible interactive controls need accessible names`).toEqual([]);

  const unboundedControls = await page.locator(
    '[data-camera-admin] button:visible, [data-camera-admin] input:not([type="hidden"]):visible, [data-camera-admin] select:visible, [data-camera-admin] textarea:visible, [data-camera-admin] [role="button"]:visible, [data-camera-admin] [role="combobox"]:visible'
  ).evaluateAll((elements) => elements.flatMap((element) => {
    if (element.closest('[aria-hidden="true"]')) return [];
    const style = getComputedStyle(element);
    const label = element.getAttribute('aria-label') || element.getAttribute('title') ||
      element.textContent?.trim().replace(/\s+/g, ' ') || element.tagName;
    if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
      const size = Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height);
      const accessibleName = element.labels?.length || element.getAttribute('aria-label') || element.getAttribute('aria-labelledby');
      return size >= 24 && style.accentColor !== 'auto' && accessibleName ? [] : [{ label, border: `native choice ${size}px, accent ${style.accentColor}, labelled ${Boolean(accessibleName)}` }];
    }
    const width = Number.parseFloat(style.borderTopWidth);
    const borderAlpha = style.borderTopColor.includes('/')
      ? style.borderTopColor.split('/').at(-1)?.replace(')', '').trim()
      : style.borderTopColor.slice(0, 4) === 'rgba'
        ? style.borderTopColor.slice(style.borderTopColor.lastIndexOf(',') + 1, -1).trim()
        : '1';
    const visible = width >= 1 && style.borderTopStyle !== 'none' && borderAlpha !== '0';
    return visible ? [] : [{ label, border: style.border }];
  }));
  expect(unboundedControls, `${path}: visible admin controls need a discernible boundary`).toEqual([]);

  const firstFocusable = await page.locator(
    '[data-camera-admin] button:visible, [data-camera-admin] a[href]:visible, [data-camera-admin] input:not([type="hidden"]):visible, [data-camera-admin] select:visible, [data-camera-admin] textarea:visible, [data-camera-admin] [role="button"]:visible, [data-camera-admin] [role="combobox"]:visible'
  ).evaluateAll((elements) => {
    const target = elements.find((element) => !element.closest('[aria-hidden="true"]') && !(element as HTMLButtonElement).disabled);
    if (!(target instanceof HTMLElement)) return null;
    target.focus();
    const style = getComputedStyle(target);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  if (!firstFocusable) {
    // Some dynamic editor routes resolve to a deliberate 404 when the E2E
    // fixture has no child record (for example, no Fanmass review item yet).
    await expect(page.getByRole('heading', { name: '404' }), `${path}: control-free page must be an intentional not-found state`).toBeVisible();
    return;
  }
  expect(firstFocusable?.outlineStyle, `${path}: first focused control needs a visible GDS focus ring`).not.toBe('none');
  expect(firstFocusable?.outlineWidth, `${path}: focus ring should be at least 2px`).toBeGreaterThanOrEqual(2);
}

async function navigateAfterAppRedirects(page: Page, route: string) {
  try {
    return await page.goto(route, { waitUntil: 'load' });
  } catch (error) {
    // Some admin entry routes intentionally redirect after client hydration. Let
    // that navigation settle, then load the intended route again for the audit.
    if (!(error instanceof Error) || !error.message.includes('ERR_ABORTED')) throw error;
    await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
    return page.goto(route, { waitUntil: 'load' });
  }
}

test('admin route inventory renders without crashes and keeps controls bounded at desktop and mobile widths', async ({ page, request }) => {
  test.setTimeout(240_000);

  const bootstrapResponse = await request.post('/api/e2e/bootstrap');
  expect(bootstrapResponse.ok()).toBeTruthy();
  const fixtures = await bootstrapResponse.json() as BootstrapPayload;
  const runId = fixtures.e2eRunId?.trim();
  expect(runId).toBeTruthy();
  expect(fixtures.eventMongoId).toBeTruthy();
  expect(fixtures.partnerMongoId).toBeTruthy();

  try {
    await loginAsGlobalAdmin(page);
    await page.keyboard.press('Escape');
    const routes = pageFiles(ADMIN_PAGES)
      .map((file) => routeForPage(file, {
        eventMongoId: fixtures.eventMongoId!,
        partnerMongoId: fixtures.partnerMongoId!,
      }))
      .sort();
    expect(routes.length, 'route inventory should track every app/admin/page.tsx file').toBeGreaterThanOrEqual(60);

    test.info().annotations.push({ type: 'coverage', description: `${routes.length} authenticated routes rendered and checked for layout/control consistency at 1440px, 768px, and 390px` });

    for (const route of routes) {
      const response = await page.request.get(route);
      expect(response.status(), `${route}: authenticated server render`).toBeLessThan(500);
      expect(await response.text(), `${route}: server render must not contain the global error boundary`).not.toContain(OOPS);
    }

    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        // The login entry point immediately replaces itself with the external
        // SSO flow. Keep its documented error state visible for layout checks.
        const browserRoute = route === '/admin/login' ? `${route}?error=no_access` : route;
        const response = await navigateAfterAppRedirects(page, browserRoute);
        expect(response?.status() ?? 599, `${route}: HTTP response`).toBeLessThan(500);
        await expect(page.getByText(OOPS), `${route}: global error boundary`).toHaveCount(0);
        await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
        await expect.poll(() => page.evaluate(() => document.body.scrollWidth), { message: `${route}: horizontal overflow at ${width}px` }).toBeLessThanOrEqual(width);
        // The SSO error/entry page is intentionally outside the authenticated
        // admin shell; its shared AuthShell is covered by route rendering.
        if (route !== '/admin/login') await assertNoVisibleAdminControlsWithoutBorders(page, route);
      }
    }
  } finally {
    if (runId) {
      const cleanup = await request.post('/api/e2e/cleanup', { data: { e2eRunId: runId } });
      expect(cleanup.ok(), 'E2E fixture cleanup').toBeTruthy();
    }
  }
});

test('account preferences expose a translated loading and retryable error state', async ({ page }) => {
  let releasePreferencesResponse: (() => void) | undefined;
  const preferencesResponseReleased = new Promise<void>((resolveResponse) => {
    releasePreferencesResponse = resolveResponse;
  });
  await page.route('**/api/account/preferences', async (route) => {
    await preferencesResponseReleased;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) });
  });
  const search = new URLSearchParams({
    role: 'admin',
    access: 'true',
    email: 'ui-preferences-error@camera.local',
    name: 'Preferences Error User',
    userId: 'ui-preferences-error-e2e',
    redirectTo: '/admin/account',
  });
  await page.goto(`/api/auth/dev-login?${search.toString()}`);
  await expect(page).toHaveURL(/\/admin\/account$/);
  const skipTour = page.getByRole('button', { name: 'Skip' });
  if (await skipTour.isVisible()) await skipTour.click();
  await expect(page.getByRole('heading', { name: 'Loading settings…' })).toBeVisible();
  releasePreferencesResponse?.();
  await expect(page.getByRole('heading', { name: 'Settings could not be loaded.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await assertNoVisibleAdminControlsWithoutBorders(page, '/admin/account(error state)');
});
