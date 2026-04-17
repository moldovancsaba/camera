/**
 * Public redirect: short slug → Camera event capture URL.
 * On GO_SHORT_HOSTNAMES, middleware rewrites `/{slug}` here (same deployment).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { defaultCameraOrigin } from '@/lib/site-hosts';
import { checkRateLimit, RATE_LIMITS, withErrorHandler, apiNotFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) => {
  await checkRateLimit(request, RATE_LIMITS.READ);

  const { slug: raw } = await context.params;
  const slug = decodeURIComponent(raw || '').trim().toLowerCase();
  if (!slug) {
    throw apiNotFound('Link');
  }

  const db = await connectToDatabase();
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ shortUrlSlug: slug });
  if (!event?._id) {
    throw apiNotFound('Link');
  }

  const dest = `${defaultCameraOrigin()}/capture/${(event._id as ObjectId).toString()}`;
  return NextResponse.redirect(dest, 302);
});
