import { apiForbidden } from '@/lib/api';

/**
 * Service-to-service auth for the messmass provisioning API, mirroring
 * assertInternalTryOnSecret / assertInternalFanmassSecret. messmass (the master
 * for organisations/partners/events) calls these endpoints with a shared secret
 * to create/link camera records. Accepts `x-messmass-secret` or Bearer.
 */
export function assertInternalMessmassSecret(request: Request): void {
  const configured = process.env.CAMERA_MESSMASS_INTERNAL_SECRET?.trim();
  if (!configured) {
    throw apiForbidden('CAMERA_MESSMASS_INTERNAL_SECRET is not configured');
  }
  const provided =
    request.headers.get('x-messmass-secret')?.trim() ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';
  if (!provided || provided !== configured) {
    throw apiForbidden('Invalid messmass internal secret');
  }
}
