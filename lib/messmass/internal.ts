import { apiForbidden } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';

/**
 * Service-to-service auth for the messmass provisioning API, mirroring
 * assertInternalFanmassSecret. messmass (the master
 * for organisations/partners/events) calls these endpoints with a shared secret
 * to create/link camera records. Accepts `x-messmass-secret` or Bearer.
 *
 * Constant-time compare, fails closed when the env secret is unset, and every
 * rejection is a bare 403 "Forbidden"; the reason goes to the server log only
 * (see lib/security/safeEqual.ts).
 */
export function assertInternalMessmassSecret(request: Request): void {
  const provided =
    request.headers.get('x-messmass-secret')?.trim() ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';
  const result = checkSharedSecret(process.env.CAMERA_MESSMASS_INTERNAL_SECRET?.trim(), provided);
  if (result !== 'ok') {
    logSharedSecretRejection('messmass internal API', 'CAMERA_MESSMASS_INTERNAL_SECRET', result);
    throw apiForbidden();
  }
}
