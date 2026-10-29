import { expect, test } from '@playwright/test';

async function signInAsGlobalAdmin(page: import('@playwright/test').Page, destination: string) {
  const login = new URLSearchParams({
    role: 'admin',
    access: 'true',
    email: 'language-admin@camera.local',
    name: 'Language Admin',
    userId: 'language-admin-e2e',
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
  await language.click();
  await page.getByRole('option', { name: 'Magyar (Hungarian)' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect.poll(() => patchBody?.uiLanguage).toBe('hu');
  await expect(page.getByRole('status', { name: 'Beállítások mentve.' })).toBeVisible();
  await expect(page.locator('html[lang="hu"]')).toBeVisible();

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const overflowingElements = await page.evaluate(() => Array.from(document.querySelectorAll('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, id: element.id, className: typeof element.className === 'string' ? element.className : '', right: Math.round(rect.right), width: Math.round(rect.width) };
      })
      .filter((element) => element.right > window.innerWidth + 1)
      .slice(0, 8));
    expect(documentWidth, `document width at ${width}px; overflow: ${JSON.stringify(overflowingElements)}`).toBeLessThanOrEqual(width);
  }
});

test('all-events analytics renders a clear database error instead of crashing when storage is unavailable', async ({ page }) => {
  await signInAsGlobalAdmin(page, '/admin/analytics');
  await expect(page).toHaveURL(/\/admin\/analytics$/);
  await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
  await expect(page.getByText('Database connection error').first()).toBeVisible();
  await expect(page.getByText('Oops! Something went wrong')).toHaveCount(0);
});
