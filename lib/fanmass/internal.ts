import { apiForbidden } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';

/**
 * Service-to-service auth for Fanmass's caller access to Camera's shared email
 * sender only. Camera's image-analysis boundary is Atlas: Fanmass reads Camera
 * source data independently, and Camera exposes no Fanmass media or result API.
 *
 * Accepts the secret via `x-fanmass-secret` or `Authorization: Bearer <secret>`.
 * Constant-time compare, fails closed when the env secret is unset, and every
 * Rejections are a bare 403 "Forbidden"; the reason goes to the server log only
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
