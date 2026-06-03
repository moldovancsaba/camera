import { NextRequest } from 'next/server';
import { withErrorHandler, requireAuth, apiSuccess } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { listActiveTryOnSetups } from '@/lib/tryon/setup-resolution';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (_request: NextRequest) => {
  await requireAuth(_request);

  const db = await connectToDatabase();
  const setups = await listActiveTryOnSetups(db);

  return apiSuccess({
    setups,
  });
});
