import { NextRequest } from 'next/server';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { assertInternalMessmassSecret } from '@/lib/messmass/internal';
import { findPartners, upsertPartner } from '@/lib/messmass/provision';

// GET /api/internal/messmass/partners?name=&messmassPartnerId=  — lookup for the linker
export const GET = withErrorHandler(async (request: NextRequest) => {
  assertInternalMessmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);
  const sp = request.nextUrl.searchParams;
  const partners = await findPartners({
    name: sp.get('name') || undefined,
    messmassPartnerId: sp.get('messmassPartnerId') || undefined,
  });
  return apiSuccess({ partners });
});

// POST /api/internal/messmass/partners  { name, messmassPartnerId?, organizationId?, logoUrl? }
// Create/link a camera partner (hybrid: by messmass id, then by name, then create).
export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalMessmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);
  const body = await request.json().catch(() => ({}));
  const partner = await upsertPartner({
    name: body.name,
    messmassPartnerId: body.messmassPartnerId,
    organizationId: body.organizationId,
    logoUrl: body.logoUrl,
  });
  return apiSuccess({ partner }, partner.created ? 201 : 200);
});
