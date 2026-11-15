import { expect, test } from '@playwright/test';

async function signInAsGlobalAdmin(page: import('@playwright/test').Page, destination: string) {
  const login = new URLSearchParams({
    role: 'admin',
    access: 'true',
    email: 'language-admin@camera.local',
    name: 'Language Admin',
    userId: `language-admin-e2e-${Date.now()}`,
    redirectTo: destination,
  });
  await page.goto(`/api/auth/dev-login?${login.toString()}`);
}

test('admin language preference shows bilingual locale names and saves on desktop and mobile', async ({ page }) => {
  let savedLanguage: string | null = null;
  let patchBody: { uiLanguage?: string | null } | null = null;

  await page.route('**/api/account/preferences', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { uiLanguage: savedLanguage, deviceLanguage: 'en' } }),
      });
      return;
    }

    patchBody = route.request().postDataJSON() as { uiLanguage?: string | null };
    savedLanguage = patchBody.uiLanguage ?? null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { uiLanguage: savedLanguage, deviceLanguage: 'en' } }),
    });
  });

  await signInAsGlobalAdmin(page, '/admin/account');
  await expect(page).toHaveURL(/\/admin\/account$/);
  await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible();
  const skipTour = page.getByRole('button', { name: 'Skip' });
  if (await skipTour.isVisible()) await skipTour.click();

  const language = page.getByRole('textbox', { name: 'Interface language' });
  await expect(language).toBeVisible();

  const unboundedControls = await page.locator(
    '[data-camera-admin] button:visible, [data-camera-admin] input:not([type="hidden"]):visible, [data-camera-admin] select:visible, [data-camera-admin] textarea:visible, [data-camera-admin] [role="button"]:visible, [data-camera-admin] [role="combobox"]:visible'
  ).evaluateAll((elements) => elements.flatMap((element) => {
    const style = getComputedStyle(element);
    const label = element.getAttribute('aria-label') || element.getAttribute('title') ||
      element.textContent?.trim().replace(/\s+/g, ' ') ||
      (element instanceof HTMLInputElement ? element.labels?.[0]?.textContent?.trim() : '') ||
      element.tagName;
    const borderWidth = Number(style.borderTopWidth.replace('px', ''));
    const borderAlpha = style.borderTopColor.includes('/')
      ? style.borderTopColor.split('/').at(-1)?.replace(')', '').trim()
      : style.borderTopColor.slice(0, 4) === 'rgba'
        ? style.borderTopColor.slice(style.borderTopColor.lastIndexOf(',') + 1, -1).trim()
        : '1';
    if (borderWidth >= 1 && style.borderTopStyle !== 'none' && borderAlpha !== '0') return [];
    return [{ label, border: style.border }];
  }));
  expect(unboundedControls, 'visible admin buttons and fields must have a discernible GDS boundary').toEqual([]);

  await page.locator('form input:visible').click();
  await page.getByRole('option', { name: 'Magyar (Hungarian)' }).click();
  await language.press('Tab');
  const focusedControl = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusedControl.outlineStyle, 'keyboard focus must remain visible').not.toBe('none');
  expect(Number(focusedControl.outlineWidth.replace('px', ''))).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect.poll(() => patchBody?.uiLanguage).toBe('hu');
  await expect(page.getByRole('status', { name: 'Beállítások mentve.' })).toBeVisible();
  await expect(page.locator('html[lang="hu"]')).toBeVisible();

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
    await expect.poll(() => page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(width);
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      shell: Array.from(document.querySelectorAll('.mantine-AppShell-main, .mantine-AppShell-navbar')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { className: element.className, x: Math.round(rect.x), right: Math.round(rect.right), width: Math.round(rect.width) };
      }),
      overflowingElements: Array.from(document.querySelectorAll('body *'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, id: element.id, className: typeof element.className === 'string' ? element.className : '', x: Math.round(rect.x), right: Math.round(rect.right), width: Math.round(rect.width) };
        })
        .filter((element) => element.right > window.innerWidth + 1)
        .slice(0, 8),
    }));
    expect(layout.documentWidth, `layout at ${width}px: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(width);
  }

  await page.locator('form input:visible').click();
  await page.getByRole('option', { name: 'العربية (Arabic)' }).click();
  await page.locator('form button[type="submit"]').click();
  await expect.poll(() => patchBody?.uiLanguage).toBe('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
  await expect.poll(() => page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390);
});

test('all-events analytics renders its data and unavailable metrics without crashing', async ({ page }) => {
  await signInAsGlobalAdmin(page, '/admin/analytics');
  await expect(page).toHaveURL(/\/admin\/analytics$/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Not measured yet' }).first()).toBeVisible();
  await expect(page.getByText('Oops! Something went wrong')).toHaveCount(0);
});
