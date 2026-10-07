/**
 * The QR code of one tracked link as an SVG (camera#320): the dark modules only, on a transparent background, so a designer can place it on
 * a poster, an email or a slide in any colour.
 *
 * GET /api/admin/events/[id]/short-links/[slug]/qr?color=%23rrggbb&download=1   (viewer; `color` is a six-digit hex colour, black when omitted;
 *   `download=1` saves the file instead of showing it)
 */

import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiBadRequest, apiNotFound, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { CAMERA_STAGE_BLACK } from '@/lib/gds/tokens/colors';
import { GO_SHORT_SLUG_PATTERN } from '@/lib/go-short-url';
import { defaultGoShortOrigin } from '@/lib/site-hosts';
import { qrSvg } from '@/lib/slideshow/screen-design';

type RouteContext = { params?: Promise<{ id: string; slug: string }> };

export const GET = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.READ);
  const { id, slug: rawSlug } = await context!.params!;
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const slug = decodeURIComponent(rawSlug || '').trim().toLowerCase();
  if (!GO_SHORT_SLUG_PATTERN.test(slug)) throw apiNotFound('Link');

  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'viewer');
  if (!(await db.collection(COLLECTIONS.SHORT_LINKS).findOne({ eventId: id, slug }, { projection: { _id: 1 } }))) throw apiNotFound('Link');

  const params = request.nextUrl.searchParams;
  const color = /^#[0-9a-f]{6}$/i.test(params.get('color') ?? '') ? (params.get('color') as string) : CAMERA_STAGE_BLACK;
  return new NextResponse(qrSvg(`${defaultGoShortOrigin()}/${slug}`, color), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'content-disposition': `${params.get('download') === '1' ? 'attachment' : 'inline'}; filename="${slug}.svg"`,
      'cache-control': 'private, max-age=300',
    },
  });
});
