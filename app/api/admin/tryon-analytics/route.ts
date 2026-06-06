import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { collectTryOnAnalytics, type TryOnAnalyticsBucket } from '@/lib/tryon/analytics';

function bucketParam(value: string | null): TryOnAnalyticsBucket | '' {
  return value === 'approved' || value === 'rejected' || value === 'service' || value === 'greatest' ? value : '';
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const { searchParams } = request.nextUrl;
  const db = await connectToDatabase();
  const analytics = await collectTryOnAnalytics(db, {
    bucket: bucketParam(searchParams.get('bucket')),
    eventId: searchParams.get('eventId')?.trim() || undefined,
    from: searchParams.get('from')?.trim() || undefined,
    to: searchParams.get('to')?.trim() || undefined,
  });

  return apiSuccess(analytics);
});
