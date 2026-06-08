/**
 * Playwright E2E Configuration
 *
 * Safety model:
 * - Tests run with workers: 1 (serially) to prevent shared-MongoDB contention.
 *   Concurrent test workers writing/deleting to the same test database caused
 *   flaky failures in the tryon-policy and tryon-rerun-lifecycle suites.
 *
 * Environment overrides (applied before any test is collected):
 * - MONGODB_DB defaults to 'camera_test' — the /api/e2e/bootstrap endpoint
 *   enforces that MONGODB_DB contains a safe keyword or it returns 403.
 * - CAMERA_TRYON_INTERNAL_SECRET defaults to 'dev-tryon-secret' for the
 *   /api/internal/tryon/complete endpoint.
 *
 * Run modes:
 * - PLAYWRIGHT_START_WEB_SERVER=true  → Playwright starts its own Next.js dev
 *   server on port 3100 with the env overrides forwarded in the command.
 * - PLAYWRIGHT_START_WEB_SERVER=false (default) → connect to an already running
 *   dev server. You must ensure it was started with a safe MONGODB_DB and the
 *   correct CAMERA_TRYON_INTERNAL_SECRET.
 *
 * Override the target URL/port via:
 * - PLAYWRIGHT_PORT (default: 3100)
 * - PLAYWRIGHT_BASE_URL (default: http://localhost:{PLAYWRIGHT_PORT})
 */

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
