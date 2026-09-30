import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { upsertCameraSetupPreference } from '@/lib/tryon/setup-resolution';
import { safeEqual } from '@/lib/security/safeEqual';
import {
  withErrorHandler,
  requireAdmin,
  apiBadRequest,
  apiNotFound,
  apiSuccess,
} from '@/lib/api';

interface TryOnSetupUsePayload {
  cameraId?: unknown;
  camera_id?: unknown;
  updatedBy?: unknown;
  updatedByEvent?: unknown;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ setupId: string }> }
) => {
  const serviceSecret = process.env.TRYON_SETUP_SELECTION_SECRET?.trim();
  const requestSecret = request.headers.get('x-camera-setup-secret')?.trim();
  // Constant-time compare (CAM-05 / SEC-09); safeEqual never matches an unset
  // secret, so an unset TRYON_SETUP_SELECTION_SECRET leaves only the session path.
  const isAuthorizedServiceCall = safeEqual(requestSecret, serviceSecret);
  // WHAT: Without the service secret, only a global admin session
  //     (appRole admin/superadmin with app access) may call this.
  // WHY: It rewrites which try-on setup a physical camera uses. The previous
  //     session-only check admitted any SSO account, guest capture sessions
  //     included; the only UI callers are the admin event create/edit forms.
  const session = isAuthorizedServiceCall ? null : await requireAdmin(request);
  const { setupId } = await context.params;
  const normalizedSetupId = readString(setupId);
  if (!normalizedSetupId) {
    throw apiBadRequest('setupId is required');
  }

  const payload = (await request.json().catch(() => ({}))) as TryOnSetupUsePayload;
  const cameraId = readString(payload.cameraId) || readString(payload.camera_id);
  if (!cameraId) {
    throw apiBadRequest('cameraId is required');
  }

  // WHAT: On the admin-session path the audit field is the signed-in admin; a
  //     body `updatedBy` is honoured only on the service-secret path, which has
  //     no session to attribute the change to.
  // WHY: camera_setup_preferences.updatedBy is the only record of who switched
  //     a physical camera's try-on setup. Taking it from the body first let a
  //     session caller write any identity into that audit trail.
  const updatedBy = session
    ? readString(session.user?.email) ?? readString(session.user?.id) ?? 'unknown-admin'
    : readString(payload.updatedBy) ?? 'camera';
  const updatedByEvent = readString(payload.updatedByEvent) || 'ui.use_setup';

  try {
    const db = await connectToDatabase();
    const preference = await upsertCameraSetupPreference(
      db,
      cameraId,
      normalizedSetupId,
      updatedBy,
      updatedByEvent
    );

    return apiSuccess({
      cameraId: preference.cameraId,
      setupId: preference.setupId,
      updatedAt: preference.updatedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'cameraId is required') {
      throw apiBadRequest(error.message);
    }

    if (error instanceof Error && error.message.startsWith('setup_not_found:')) {
      const missingSetupId = error.message.replace(/^setup_not_found:/, '').trim();
      throw apiNotFound(`Try-on setup${missingSetupId ? ` (${missingSetupId})` : ''}`);
    }

    throw error;
  }
});
