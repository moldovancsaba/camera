import { expect, test } from '@playwright/test';

type BootstrapPayload = {
  partnerId: string;
  moderationEventId: string;
  moderationResultSubmissionMongoId: string;
  playlistSlideshowId: string;
  playlistApprovedSubmissionMongoId: string;
};

async function devLogin(page: import('@playwright/test').Page) {
  await page.goto(
    '/api/auth/dev-login?role=admin&access=true&email=e2e-admin@camera.local&name=E2E+Admin&redirectTo=/admin'
  );
  await expect(page).toHaveURL(/\/admin$/);
}

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('try-on policy integration', () => {
  test('event policy persists result slideshow mode contract', async ({ page, request }) => {
    const bootstrap = await request.post('/api/e2e/bootstrap');
    expect(bootstrap.ok()).toBeTruthy();
    const bootstrapPayload = (await bootstrap.json()) as BootstrapPayload;

    await devLogin(page);

    const createResponse = await page.request.post('/api/events', {
      data: {
        name: uniq('E2E Policy Event'),
        partnerId: bootstrapPayload.partnerId,
        isActive: true,
        showLogo: false,
        tryOn: {
          enabled: true,
          allowedLeatherSuitIds: [],
          includeApprovedResultsInSlideshows: true,
          resultSlideshowMode: 'approved_results_only',
        },
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createPayload = await createResponse.json();
    const eventMongoId = createPayload?.data?.event?._id;
    expect(eventMongoId).toBeTruthy();

    const getResponse = await page.request.get(`/api/events/${eventMongoId}`);
    expect(getResponse.ok()).toBeTruthy();
    const getPayload = await getResponse.json();
    const event = getPayload?.data?.event ?? getPayload?.event;
    expect(event?.tryOn?.enabled).toBeTruthy();
    expect(event?.tryOn?.resultSlideshowMode).toBe('approved_results_only');
    expect(event?.tryOn?.includeApprovedResultsInSlideshows).toBeTruthy();
  });

  test('moderation approval derives slideshow eligibility from event policy', async ({ page, request }) => {
    const bootstrap = await request.post('/api/e2e/bootstrap');
    expect(bootstrap.ok()).toBeTruthy();
    const bootstrapPayload = (await bootstrap.json()) as BootstrapPayload;

    await devLogin(page);

    const approveResponse = await page.request.post(
      `/api/admin/tryon-results/${bootstrapPayload.moderationResultSubmissionMongoId}/approve`,
      { data: { notes: 'E2E approval' } }
    );
    expect(approveResponse.ok()).toBeTruthy();

    const listResponse = await page.request.get(
      `/api/admin/tryon-results?archive=approved&eventId=${encodeURIComponent(
        bootstrapPayload.moderationEventId
      )}&limit=100`
    );
    expect(listResponse.ok()).toBeTruthy();
    const listPayload = await listResponse.json();
    const rows = listPayload?.data?.results ?? listPayload?.results ?? [];
    const row = rows.find(
      (candidate: { id?: string }) =>
        candidate.id === bootstrapPayload.moderationResultSubmissionMongoId
    );
    expect(row).toBeTruthy();
    expect(row.reviewStatus).toBe('approved');
    expect(row.isShareVisible).toBeTruthy();
    expect(row.isSlideshowEligible).toBeFalsy();
  });

  test('playlist source selection follows event result slideshow policy', async ({ page, request }) => {
    const bootstrap = await request.post('/api/e2e/bootstrap');
    expect(bootstrap.ok()).toBeTruthy();
    const bootstrapPayload = (await bootstrap.json()) as BootstrapPayload;

    await devLogin(page);

    const playlistResponse = await page.request.get(
      `/api/slideshows/${bootstrapPayload.playlistSlideshowId}/playlist?limit=3`
    );
    expect(playlistResponse.ok()).toBeTruthy();
    const payload = await playlistResponse.json();
    const playlist = payload?.playlist as Array<{
      submissions: Array<{ _id: string }>;
    }>;
    expect(Array.isArray(playlist)).toBeTruthy();
    expect(playlist.length).toBeGreaterThan(0);
    for (const slide of playlist) {
      for (const submission of slide.submissions) {
        expect(submission._id).toBe(bootstrapPayload.playlistApprovedSubmissionMongoId);
      }
    }
  });
});
