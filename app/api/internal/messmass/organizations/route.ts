import { NextRequest } from 'next/server';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { assertInternalMessmassSecret } from '@/lib/messmass/internal';
import { upsertOrganization } from '@/lib/messmass/provision';

// POST /api/internal/messmass/organizations  { name, messmassOrganizationId? }
// Create/link a camera organization mirroring a messmass organisation.
export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalMessmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);
  const body = await request.json().catch(() => ({}));
  const organization = await upsertOrganization({
    name: body.name,
    messmassOrganizationId: body.messmassOrganizationId,
  });
  return apiSuccess({ organization }, organization.created ? 201 : 200);
});
