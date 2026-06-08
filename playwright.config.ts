import { defineConfig, devices } from '@playwright/test';

// Ensure standard development/test environments are defined for the test runner process
process.env.MONGODB_DB ||= 'camera_test';
process.env.CAMERA_TRYON_INTERNAL_SECRET ||= 'dev-tryon-secret';

const defaultPort = process.env.PLAYWRIGHT_PORT || '3100';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${defaultPort}`;
const shouldStartServer = process.env.PLAYWRIGHT_START_WEB_SERVER === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  // Run tests serially to prevent shared-database contention.
  // Tests share the same MongoDB test instance so concurrent writes/deletes
  // can cause flaky failures when data bootstrapped by one test is cleaned up
  // while another test is still using it.
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: shouldStartServer
    ? {
        command: `MONGODB_DB=${process.env.MONGODB_DB} CAMERA_TRYON_INTERNAL_SECRET=${process.env.CAMERA_TRYON_INTERNAL_SECRET} PORT=${defaultPort} npm run dev`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
