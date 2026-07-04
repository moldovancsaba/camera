/**
 * Verify dangerous dev routes are unreachable in production (GitHub #85).
 *
 * Usage (repo root):
 *   npm run verify:production-guards
 *
 * Two layers of assurance:
 *
 * 1. Behavioral: `blockDangerousApiInProduction()` is exercised in-process
 *    under NODE_ENV=production with ALLOW_DANGEROUS_DEV_ROUTES unset (must
 *    return a 404 response), with the flag set (must return null), and under
 *    NODE_ENV=development (must return null).
 *
 * 2. Static wiring: every route file in the dangerous-route list below must
 *    (a) exist and (b) call blockDangerousApiInProduction, so nobody can add
 *    or refactor a dev-only route past the guarantee unnoticed. If a new
 *    dangerous route is added, it must be listed here.
 *
 * Exit code 0 = guarantee holds; non-zero = a guard is missing or broken.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { blockDangerousApiInProduction } from '../lib/api/production-guard';

/**
 * Every dev-only / dangerous route handler. Adding a route here is part of
 * the definition of done for any new dev-only endpoint.
 */
const DANGEROUS_ROUTE_FILES = [
  'app/api/auth/dev-login/route.ts',
  'app/api/e2e/bootstrap/route.ts',
  'app/api/e2e/cleanup/route.ts',
  'app/api/debug/users/route.ts',
  'app/api/debug/submissions/route.ts',
  'app/api/debug/event-logos/route.ts',
  'app/api/test-frames/route.ts',
  'app/api/test-db/route.ts',
  'app/api/migrate/submissions/route.ts',
];

let failures = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures += 1;
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function verifyGuardBehavior(): Promise<void> {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ALLOW_DANGEROUS_DEV_ROUTES;

  try {
    // NODE_ENV is read dynamically by the guard, so it can be flipped here.
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete process.env.ALLOW_DANGEROUS_DEV_ROUTES;
    const blockedResponse = blockDangerousApiInProduction();
    check(
      'production + flag unset → blocked with 404',
      blockedResponse !== null && blockedResponse.status === 404,
      `got ${blockedResponse === null ? 'null (NOT BLOCKED)' : `status ${blockedResponse.status}`}`
    );
    if (blockedResponse) {
      const body = (await blockedResponse.json()) as { error?: string };
      check(
        'production 404 body does not reveal the route exists',
        body.error === 'Not found',
        `body: ${JSON.stringify(body)}`
      );
    }

    process.env.ALLOW_DANGEROUS_DEV_ROUTES = 'true';
    check(
      'production + ALLOW_DANGEROUS_DEV_ROUTES=true → explicitly allowed',
      blockDangerousApiInProduction() === null
    );

    // Any value other than the literal string 'true' must still block.
    process.env.ALLOW_DANGEROUS_DEV_ROUTES = '1';
    check(
      'production + ALLOW_DANGEROUS_DEV_ROUTES=1 (non-literal) → still blocked',
      blockDangerousApiInProduction()?.status === 404
    );

    (process.env as Record<string, string>).NODE_ENV = 'development';
    delete process.env.ALLOW_DANGEROUS_DEV_ROUTES;
    check('development → allowed', blockDangerousApiInProduction() === null);
  } finally {
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      (process.env as Record<string, string>).NODE_ENV = originalNodeEnv;
    }
    if (originalFlag === undefined) {
      delete process.env.ALLOW_DANGEROUS_DEV_ROUTES;
    } else {
      process.env.ALLOW_DANGEROUS_DEV_ROUTES = originalFlag;
    }
  }
}

function verifyRouteWiring(): void {
  for (const routeFile of DANGEROUS_ROUTE_FILES) {
    const absolutePath = resolve(process.cwd(), routeFile);
    let source: string;
    try {
      source = readFileSync(absolutePath, 'utf8');
    } catch {
      check(`${routeFile} exists`, false, 'listed as dangerous but file is missing — update the list');
      continue;
    }
    const imported = source.includes('blockDangerousApiInProduction');
    const invoked = /blockDangerousApiInProduction\s*\(/.test(source);
    check(`${routeFile} calls blockDangerousApiInProduction`, imported && invoked);
  }
}

async function main(): Promise<void> {
  console.log('— Guard behavior —');
  await verifyGuardBehavior();
  console.log('\n— Route wiring —');
  verifyRouteWiring();

  if (failures > 0) {
    console.error(`\n✗ ${failures} check(s) failed: dangerous dev routes may be reachable in production.`);
    process.exit(1);
  }
  console.log('\n✓ All production-guard checks passed.');
}

void main();
