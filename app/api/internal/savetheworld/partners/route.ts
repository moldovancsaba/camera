import { NextRequest } from 'next/server';
import { apiSuccess, withErrorHandler, checkRateLimit, RATE_LIMITS } from '@/lib/api';
import { assertInternalSavetheworldSecret } from '@/lib/savetheworld/internal';
import { upsertPartner } from '@/lib/savetheworld/provision';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

// POST /api/internal/savetheworld/partners  { name, logoUrl? }
// Create/link a camera partner for savetheworld (link by case-insensitive name, else create).
export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalSavetheworldSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);
  const body = await request.json().catch(() => ({}));
  const partner = await upsertPartner({ name: body.name, logoUrl: body.logoUrl });
  return apiSuccess({ partner }, partner.created ? 201 : 200);
});

// GET /api/internal/savetheworld/partners
// List active camera partners, for savetheworld to pick from when linking a sport event.
export const GET = withErrorHandler(async (request: NextRequest) => {
  assertInternalSavetheworldSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);
  const db = await connectToDatabase();
  const docs = await db
    .collection(COLLECTIONS.PARTNERS)
    .find({ isActive: true })
    .sort({ name: 1 })
    .toArray();
  const partners = docs.map((p) => ({
    partnerId: p.partnerId,
    name: p.name,
    logoUrl: p.logoUrl || null,
  }));
  return apiSuccess({ partners });
});
