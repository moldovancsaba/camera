import { apiForbidden } from '@/lib/api';

/**
 * Service-to-service auth for the savetheworld provisioning API, mirroring
 * assertInternalMessmassSecret / assertInternalFanmassSecret. savetheworld
 * calls these endpoints with a shared secret to create/link camera records
 * for its pledge campaign. Accepts `x-savetheworld-secret` or Bearer.
 */
export function assertInternalSavetheworldSecret(request: Request): void {
  const configured = process.env.CAMERA_SAVETHEWORLD_INTERNAL_SECRET?.trim();
  if (!configured) {
    throw apiForbidden('CAMERA_SAVETHEWORLD_INTERNAL_SECRET is not configured');
  }
  const provided =
    request.headers.get('x-savetheworld-secret')?.trim() ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';
  if (!provided || provided !== configured) {
    throw apiForbidden('Invalid savetheworld internal secret');
  }
}
