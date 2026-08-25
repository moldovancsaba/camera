import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { collectTryOnAnalytics, resolveTryOnAnalyticsEventScope, type TryOnAnalyticsBucket } from '@/lib/tryon/analytics';

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
  // Resolve the event reference to both key namespaces (submissions: UUID,
  // jobs: Mongo _id) so neither half of the report silently filters to zero.
  const rawEventId = searchParams.get('eventId')?.trim() || '';
  const eventScope = rawEventId ? await resolveTryOnAnalyticsEventScope(db, rawEventId) : {};
  const analytics = await collectTryOnAnalytics(db, {
    bucket: bucketParam(searchParams.get('bucket')),
    eventId: eventScope.eventId ?? (rawEventId || undefined),
    eventMongoId: eventScope.eventMongoId,
    from: searchParams.get('from')?.trim() || undefined,
    to: searchParams.get('to')?.trim() || undefined,
  });

  return apiSuccess(analytics);
});
