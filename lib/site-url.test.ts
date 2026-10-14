import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getConfiguredSiteUrl } from './site-url';

test('a legacy production base URL produces Messmass public links', () => {
  const keys = ['NODE_ENV', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_BASE_URL', 'APP_URL', 'NEXTAUTH_URL', 'SITE_URL', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_DEPLOYMENT_URL'] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    for (const key of keys.slice(1)) delete process.env[key];
    process.env.NEXT_PUBLIC_APP_URL = 'https://camera.doneisbetter.com/';
    assert.equal(getConfiguredSiteUrl(), 'https://camera.messmass.com');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('without a configured URL, public links use the Camera Messmass origin', () => {
  const keys = ['NODE_ENV', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_BASE_URL', 'APP_URL', 'NEXTAUTH_URL', 'SITE_URL', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_DEPLOYMENT_URL'] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    for (const key of keys.slice(1)) delete process.env[key];
    assert.equal(getConfiguredSiteUrl(), 'https://camera.messmass.com');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
