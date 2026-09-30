import { apiForbidden } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';

/**
 * Service-to-service auth for the fanmass read API, mirroring
 * assertInternalTryOnSecret (lib/tryon/completion.ts). fanmass (a headless
 * server) polls these read-only endpoints with a shared secret; there is no
 * browser session, so this is the machine-auth path.
 *
 * Accepts the secret via `x-fanmass-secret` or `Authorization: Bearer <secret>`.
 * Constant-time compare, fails closed when the env secret is unset, and every
 * rejection is a bare 403 "Forbidden"; the reason goes to the server log only
 * (see lib/security/safeEqual.ts).
 */
export function assertInternalFanmassSecret(request: Request): void {
  const provided =
    request.headers.get('x-fanmass-secret')?.trim() ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';

  const result = checkSharedSecret(process.env.CAMERA_FANMASS_INTERNAL_SECRET?.trim(), provided);
  if (result !== 'ok') {
    logSharedSecretRejection('fanmass internal API', 'CAMERA_FANMASS_INTERNAL_SECRET', result);
    throw apiForbidden();
  }
}
