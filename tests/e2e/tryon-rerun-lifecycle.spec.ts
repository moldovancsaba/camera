import { expect, test } from '@playwright/test';

type BootstrapPayload = {
  moderationResultSubmissionMongoId: string;
  moderationSourceJobId: string;
  moderationSetupId: string;
  e2eRunId?: string;
};

async function devLogin(page: import('@playwright/test').Page) {
  await page.goto(
    '/api/auth/dev-login?role=admin&access=true&email=e2e-admin@camera.local&name=E2E+Admin&redirectTo=/admin'
  );
  await expect(page).toHaveURL(/\/admin$/);
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

test.describe('try-on rerun lifecycle', () => {
  test('submit again archives old result and new completion returns to pending review', async ({ page, request }) => {
    await withBootstrap(request, async (bootstrapPayload) => {
      await devLogin(page);

      const pendingBefore = await page.request.get('/api/admin/tryon-results?reviewStatus=pending_review&limit=100');
      expect(pendingBefore.ok()).toBeTruthy();
      const pendingBeforePayload = await pendingBefore.json();
      const pendingIdsBefore = (pendingBeforePayload.data?.results ?? []).map((row: { id: string }) => row.id);
      expect(pendingIdsBefore).toContain(bootstrapPayload.moderationResultSubmissionMongoId);

      const rerunResponse = await page.request.post(
        `/api/admin/tryon-jobs/${bootstrapPayload.moderationSourceJobId}/rerun`,
        { data: { setupId: bootstrapPayload.moderationSetupId } }
      );
      expect(rerunResponse.ok()).toBeTruthy();
      const rerunPayload = await rerunResponse.json();
      const rerunJobId = rerunPayload.data?.jobId;
      expect(rerunJobId).toBeTruthy();
      expect(rerunPayload.data?.oldResultArchived).toBeTruthy();
      expect(rerunPayload.data?.oldResultArchiveReason).toBe('quality_rerun_superseded');

      const pendingAfterRerun = await page.request.get('/api/admin/tryon-results?reviewStatus=pending_review&limit=100');
      const pendingAfterRerunPayload = await pendingAfterRerun.json();
      const pendingIdsAfterRerun = (pendingAfterRerunPayload.data?.results ?? []).map((row: { id: string }) => row.id);
      expect(pendingIdsAfterRerun).not.toContain(bootstrapPayload.moderationResultSubmissionMongoId);

      const internalSecret = process.env.CAMERA_TRYON_INTERNAL_SECRET?.trim();
      expect(internalSecret).toBeTruthy();

      const completionResponse = await page.request.post('/api/internal/tryon/complete', {
        headers: {
          'x-camera-tryon-secret': internalSecret!,
        },
        data: {
          jobId: rerunJobId,
          publicResultUrl: 'https://i.ibb.co/e2e-rerun-result.jpg',
        },
      });
      expect(completionResponse.ok()).toBeTruthy();
      const completionPayload = await completionResponse.json();
      const newResultSubmissionId = completionPayload.data?.resultSubmissionId;
      expect(newResultSubmissionId).toBeTruthy();

      const newResultResponse = await page.request.get(`/api/admin/tryon-results?reviewStatus=pending_review&limit=100`);
      const newResultPayload = await newResultResponse.json();
      const pendingRows = newResultPayload.data?.results ?? [];
      const newResult = pendingRows.find((row: { id: string }) => row.id === newResultSubmissionId);
      expect(newResult).toBeTruthy();
      expect(newResult.reviewStatus).toBe('pending_review');
      expect(newResult.isShareVisible).toBeFalsy();

      const approveResponse = await page.request.post(`/api/admin/tryon-results/${newResultSubmissionId}/approve`, {
        data: {},
      });
      expect(approveResponse.ok()).toBeTruthy();

      const approvedList = await page.request.get('/api/admin/tryon-results?reviewStatus=approved&limit=100');
      const approvedPayload = await approvedList.json();
      const approvedRow = (approvedPayload.data?.results ?? []).find((row: { id: string }) => row.id === newResultSubmissionId);
      expect(approvedRow?.isShareVisible).toBeTruthy();
    });
  });
});
