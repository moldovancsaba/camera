import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { upsertCameraSetupPreference } from '@/lib/tryon/setup-resolution';
import {
  withErrorHandler,
  requireAuth,
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
  const isAuthorizedServiceCall = Boolean(serviceSecret && requestSecret && serviceSecret === requestSecret);
  const session = isAuthorizedServiceCall ? null : await requireAuth(request);
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

  const updatedBy = readString(payload.updatedBy) ?? session?.user?.email ?? 'camera';
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
