import { defineConfig, devices } from '@playwright/test';

const defaultPort = process.env.PLAYWRIGHT_PORT || '3100';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${defaultPort}`;
const shouldStartServer = process.env.PLAYWRIGHT_START_WEB_SERVER === 'true';

export default defineConfig({
  testDir: './tests/e2e',
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
        command: `PORT=${defaultPort} npm run dev`,
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
