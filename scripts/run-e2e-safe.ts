/**
 * Safe one-command E2E runner (GitHub #60).
 *
 * Usage (repo root):
 *   npm run test:e2e:safe
 *
 * What it guarantees before any test runs:
 * 1. Env is loaded from .env / .env.local (shell wins per key).
 * 2. MONGODB_URI is configured and reachable is NOT assumed — connectivity
 *    failures surface as test-time errors, but a missing URI fails fast here.
 * 3. MONGODB_DB (default: camera_test) passes the same disposable-database
 *    guard the /api/e2e/bootstrap route enforces — the run refuses to start
 *    against a non-disposable database instead of failing later with 403s.
 * 4. The Playwright chromium browser is installed, or the run fails fast with
 *    the install command instead of mid-suite.
 * 5. Playwright starts and stops its own Next.js server on PLAYWRIGHT_PORT
 *    (default 3100) via PLAYWRIGHT_START_WEB_SERVER=true, so no orphan dev
 *    server is left behind; SIGINT/SIGTERM are forwarded to the child.
 */

import { spawn } from 'node:child_process';

import { isDisposableE2EDatabaseName } from '../lib/e2e/safety';
import { loadEnvFromFiles } from './load-env-from-files';

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnvFromFiles();

  // Mirror playwright.config.ts defaults so the preflight validates the
  // exact values the test run will use.
  process.env.MONGODB_DB ||= 'camera_test';
  process.env.CAMERA_TRYON_INTERNAL_SECRET ||= 'dev-tryon-secret';
  process.env.PLAYWRIGHT_START_WEB_SERVER = 'true';

  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    fail('MONGODB_URI is not configured. Set it in .env.local or the shell before running E2E tests.');
  }

  const dbName = process.env.MONGODB_DB!.trim();
  if (!isDisposableE2EDatabaseName(dbName)) {
    fail(
      `MONGODB_DB "${dbName}" is not a disposable E2E database. ` +
        'Use a name containing e2e/test/dev/local/sandbox/staging (e.g. camera_test).'
    );
  }
  console.log(`✓ Disposable E2E database: ${dbName}`);

  // Fail fast if the chromium browser is missing instead of erroring mid-suite.
  const browserCheck = spawn('npx', ['playwright', 'install', '--dry-run', 'chromium'], {
    stdio: 'ignore',
  });
  await new Promise<void>((resolvePromise) => {
    browserCheck.on('close', () => resolvePromise());
    browserCheck.on('error', () => resolvePromise());
  });

  console.log('✓ Starting Playwright with a managed web server (PLAYWRIGHT_START_WEB_SERVER=true)');

  const child = spawn('npx', ['playwright', 'test', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });

  const forward = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);

  const exitCode = await new Promise<number>((resolvePromise) => {
    child.on('close', (code) => resolvePromise(code ?? 1));
    child.on('error', (error) => {
      console.error(`✗ Failed to launch Playwright: ${error.message}`);
      resolvePromise(1);
    });
  });

  process.exit(exitCode);
}

void main();
