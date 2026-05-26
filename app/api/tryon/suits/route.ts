import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiSuccess, withErrorHandler } from '@/lib/api';
import { listActiveTryOnSuitOptions, listActiveTryOnSuitOptionsForEvent } from '@/lib/tryon/suits';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const db = await connectToDatabase();
  const eventMongoId = request.nextUrl.searchParams.get('eventId')?.trim();
  const suits = eventMongoId
    ? await listActiveTryOnSuitOptionsForEvent(db, eventMongoId)
    : await listActiveTryOnSuitOptions(db);

  return apiSuccess({
    suits,
  });
});
