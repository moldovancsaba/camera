import { expect, test, type Page } from '@playwright/test';

/**
 * Authenticated admin smoke test.
 *
 * Renders every admin surface (and the profile page) as a global admin and asserts
 * the global error boundary (`app/error.tsx`, "Oops! Something went wrong") is NOT
 * shown. This guards the Server-Components render-crash family — notably the
 * `component={Link}`-in-a-Server-Component crash (digest 4053814135, #80) that
 * shipped to production because no test loaded the rendered authenticated pages.
 *
 * The event detail page additionally asserts the "Local AI Services" card renders:
 * that card holds the action buttons that previously crashed, so its presence
 * proves the page rendered past the failure point.
 */

type BootstrapPayload = {
  e2eRunId?: string;
  eventMongoId?: string;
  moderationEventMongoId?: string;
};

let bootstrapRunId = '';
let eventMongoId = '';
let moderationEventMongoId = '';

const OOPS = 'Oops! Something went wrong';

async function devLoginAsGlobalAdmin(page: Page) {
  const search = new URLSearchParams({
    role: 'admin',
    access: 'true',
    email: 'global-admin@camera.local',
    name: 'Global Admin',
    redirectTo: '/admin',
  });
  await page.goto(`/api/auth/dev-login?${search.toString()}`);
  await expect(page).toHaveURL(/\/admin$/);
}

async function expectRendersWithoutError(page: Page, path: string) {
  const response = await page.goto(path);
  // A server crash still returns 200 with the error boundary, so assert on content.
  expect(response?.status(), `${path} HTTP status`).toBeLessThan(400);
  await expect(page.getByText(OOPS), `${path} should not show the error boundary`).toHaveCount(0);
}

test.describe('admin smoke — every admin page renders without the error boundary', () => {
  test.beforeEach(async ({ request }) => {
    const bootstrap = await request.post('/api/e2e/bootstrap');
    expect(bootstrap.ok()).toBeTruthy();
    const payload = (await bootstrap.json()) as BootstrapPayload;
    bootstrapRunId = payload.e2eRunId?.trim() ?? '';
    eventMongoId = payload.eventMongoId?.trim() ?? '';
    moderationEventMongoId = payload.moderationEventMongoId?.trim() ?? '';
    expect(eventMongoId, 'bootstrap returns eventMongoId').toBeTruthy();
    expect(moderationEventMongoId, 'bootstrap returns moderationEventMongoId').toBeTruthy();
  });

  test.afterEach(async ({ request }) => {
    if (!bootstrapRunId) return;
    await request.post('/api/e2e/cleanup', { data: { e2eRunId: bootstrapRunId } });
    bootstrapRunId = '';
  });

  test('admin index pages render', async ({ page }) => {
    await devLoginAsGlobalAdmin(page);
    for (const path of [
      '/admin',
      '/admin/events',
      '/admin/partners',
      '/admin/frames',
      '/admin/logos',
      '/admin/submissions',
      '/admin/users',
      '/admin/tryon',
      '/admin/landing-pages',
    ]) {
      await expectRendersWithoutError(page, path);
    }
  });

  test('event detail and edit pages render (RSC component-prop regression guard)', async ({ page }) => {
    await devLoginAsGlobalAdmin(page);

    // Plain event and the try-on-enabled moderation event both render the
    // "Local AI Services" card whose action buttons triggered digest 4053814135.
    for (const id of [eventMongoId, moderationEventMongoId]) {
      await expectRendersWithoutError(page, `/admin/events/${id}`);
      await expect(
        page.getByText('Local AI Services'),
        `event ${id} detail should render past the previously-crashing card`
      ).toBeVisible();
    }

    await expectRendersWithoutError(page, `/admin/events/${eventMongoId}/edit`);
  });

  test('profile page renders', async ({ page }) => {
    await devLoginAsGlobalAdmin(page);
    await expectRendersWithoutError(page, '/profile');
  });
});
