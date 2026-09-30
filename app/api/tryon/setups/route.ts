import { NextRequest } from 'next/server';
import { withErrorHandler, requireAdmin, apiSuccess } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getCameraSetupPreference, listActiveTryOnSetups } from '@/lib/tryon/setup-resolution';

export const dynamic = 'force-dynamic';

function readString(value: string | null): string | null {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  // WHAT: Global admins only (appRole admin/superadmin with app access).
  // WHY: Returns every active try-on setup config plus a camera's routing
  //     preference -- AI Setups are global-admin configuration (the
  //     /admin/tryon/setups CRUD and nav entry are global-admin-only). The
  //     previous session-only check admitted any SSO account, guest capture
  //     sessions included.
  await requireAdmin(request);

  const db = await connectToDatabase();
  const setups = await listActiveTryOnSetups(db);
  const cameraId = readString(request.nextUrl.searchParams.get('cameraId'));
  const preference = cameraId ? await getCameraSetupPreference(db, cameraId) : null;

  return apiSuccess({
    setups,
    cameraPreference: preference,
  });
});
