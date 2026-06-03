import { NextRequest } from 'next/server';
import { withErrorHandler, requireAuth, apiSuccess } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getCameraSetupPreference, listActiveTryOnSetups } from '@/lib/tryon/setup-resolution';

export const dynamic = 'force-dynamic';

function readString(value: string | null): string | null {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAuth(request);

  const db = await connectToDatabase();
  const setups = await listActiveTryOnSetups(db);
  const cameraId = readString(request.nextUrl.searchParams.get('cameraId'));
  const preference = cameraId ? await getCameraSetupPreference(db, cameraId) : null;

  return apiSuccess({
    setups,
    cameraPreference: preference,
  });
});
