/**
 * Gate dev-only / dangerous API routes in production.
 * Set ALLOW_DANGEROUS_DEV_ROUTES=true only on private staging if you must expose them.
 */

import { NextResponse } from 'next/server';

export function blockDangerousApiInProduction(): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }
  if (process.env.ALLOW_DANGEROUS_DEV_ROUTES === 'true') {
    return null;
  }
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
