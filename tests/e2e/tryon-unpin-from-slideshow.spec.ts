import { expect, test } from '@playwright/test';

type BootstrapPayload = {
  partnerId: string;
  moderationEventId: string;
  moderationResultSubmissionMongoId: string;
  playlistSlideshowId: string;
  playlistApprovedSubmissionMongoId: string;
  e2eRunId?: string;
};

type PinCall = { slideshowId: string; pin: boolean };

async function devLogin(page: import('@playwright/test').Page) {
  await page.goto(
    '/api/auth/dev-login?role=admin&access=true&email=e2e-admin@camera.local&name=E2E+Admin&redirectTo=/admin'
  );
  await expect(page).toHaveURL(/\/admin$/);
}

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function withBootstrap<T>(request: import('@playwright/test').APIRequestContext, fn: (payload: BootstrapPayload) => Promise<T>): Promise<T> {
  const bootstrap = await request.post('/api/e2e/bootstrap');
  expect(bootstrap.ok()).toBeTruthy();
  const bootstrapPayload = (await bootstrap.json()) as BootstrapPayload;
  expect(bootstrapPayload.e2eRunId?.trim()).toBeTruthy();

  try {
    return await fn(bootstrapPayload);
  } finally {
    if (bootstrapPayload.e2eRunId?.trim()) {
      const cleanupResponse = await request.post('/api/e2e/cleanup', {
        data: { e2eRunId: bootstrapPayload.e2eRunId },
      });
      expect(cleanupResponse.ok()).toBeTruthy();
    }
  }
}

async function createSlideshow(
  request: import('@playwright/test').APIRequestContext,
  eventMongoId: string,
  name: string
): Promise<{ mongoId: string; slideshowId: string; name: string }> {
  const response = await request.post('/api/slideshows', {
    data: { eventId: eventMongoId, name },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return {
    mongoId: String(payload.slideshow._id),
    slideshowId: String(payload.slideshow.slideshowId),
    name,
  };
}

async function deleteSlideshow(request: import('@playwright/test').APIRequestContext, mongoId: string) {
  const response = await request.delete(`/api/slideshows?id=${mongoId}`);
  expect(response.ok()).toBeTruthy();
}

async function pinToSlideshow(
  request: import('@playwright/test').APIRequestContext,
  submissionMongoId: string,
  slideshowId: string,
  pin: boolean
) {
  const response = await request.post(`/api/admin/tryon-results/${submissionMongoId}/pin-to-slideshow`, {
    data: { slideshowId, pin },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe('unpin from slideshow', () => {
  test('shows one Unpin control per pinned slideshow, gated by confirmation', async ({ page, request }) => {
    await withBootstrap(request, async (bootstrapPayload) => {
      await devLogin(page);

      const eventResponse = await page.request.get(`/api/events/${bootstrapPayload.moderationEventId}`);
      expect(eventResponse.ok()).toBeTruthy();
      const eventPayload = await eventResponse.json();
      const eventMongoId = String(eventPayload.data?.event?._id ?? eventPayload.event?._id);
      expect(eventMongoId).toBeTruthy();

      const slideshowA = await createSlideshow(page.request, eventMongoId, uniq('E2E Unpin Slideshow A'));
      const slideshowB = await createSlideshow(page.request, eventMongoId, uniq('E2E Unpin Slideshow B'));

      try {
        const vettingUrl = `/admin/tryon/vetting?eventId=${bootstrapPayload.moderationEventId}`;

        // Before any pin exists, the row carries no pinnedSlideshows -- no
        // Unpin control should render at all.
        await page.goto(vettingUrl);
        await expect(page.getByRole('button', { name: `Unpin from ${slideshowA.name}` })).toHaveCount(0);
        await expect(page.getByRole('button', { name: `Unpin from ${slideshowB.name}` })).toHaveCount(0);

        await pinToSlideshow(page.request, bootstrapPayload.moderationResultSubmissionMongoId, slideshowA.slideshowId, true);
        await pinToSlideshow(page.request, bootstrapPayload.moderationResultSubmissionMongoId, slideshowB.slideshowId, true);

        const pinCalls: PinCall[] = [];
        await page.route('**/api/admin/tryon-results/*/pin-to-slideshow', async (route) => {
          const body = route.request().postDataJSON() as { slideshowId?: string; pin?: boolean };
          pinCalls.push({ slideshowId: body.slideshowId ?? '', pin: body.pin !== false });
          await route.continue();
        });

        // page.tsx's batched Slideshow lookup must surface both pins onto the
        // row -- each renders its own independently addressable control.
        await page.goto(vettingUrl);
        const unpinA = page.getByRole('button', { name: `Unpin from ${slideshowA.name}` }).first();
        const unpinB = page.getByRole('button', { name: `Unpin from ${slideshowB.name}` }).first();
        await expect(unpinA).toBeVisible();
        await expect(unpinB).toBeVisible();

        // Cancel path: dismissing the confirm dialog must never reach the API.
        await unpinA.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.getByRole('dialog')).toBeHidden();
        expect(pinCalls).toHaveLength(0);
        await expect(unpinA).toBeVisible();
        await expect(unpinB).toBeVisible();

        // Confirm path: only the confirmed slideshow's pin is removed: the
        // API sees {slideshowId, pin:false}, the row drops just that entry
        // locally, and the sibling slideshow's control is unaffected.
        await unpinA.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('button', { name: 'Confirm' }).click();

        await expect.poll(() => pinCalls.length).toBe(1);
        expect(pinCalls[0]).toEqual({ slideshowId: slideshowA.slideshowId, pin: false });
        await expect(unpinA).toHaveCount(0);
        await expect(unpinB).toBeVisible();
      } finally {
        await deleteSlideshow(page.request, slideshowA.mongoId);
        await deleteSlideshow(page.request, slideshowB.mongoId);
      }
    });
  });
});
