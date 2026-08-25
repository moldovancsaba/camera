import { NextRequest } from 'next/server';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { assertInternalSavetheworldSecret } from '@/lib/savetheworld/internal';
import { upsertPartner } from '@/lib/savetheworld/provision';

// POST /api/internal/savetheworld/partners  { name, logoUrl? }
// Create/link a camera partner for savetheworld (link by case-insensitive name, else create).
export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalSavetheworldSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);
  const body = await request.json().catch(() => ({}));
  const partner = await upsertPartner({ name: body.name, logoUrl: body.logoUrl });
  return apiSuccess({ partner }, partner.created ? 201 : 200);
});
