import { apiForbidden } from '@/lib/api';

/**
 * Service-to-service auth for the fanmass read API, mirroring
 * assertInternalTryOnSecret (lib/tryon/completion.ts). fanmass (a headless
 * server) polls these read-only endpoints with a shared secret; there is no
 * browser session, so this is the machine-auth path.
 *
 * Accepts the secret via `x-fanmass-secret` or `Authorization: Bearer <secret>`.
 */
export function assertInternalFanmassSecret(request: Request): void {
  const configured = process.env.CAMERA_FANMASS_INTERNAL_SECRET?.trim();
  if (!configured) {
    throw apiForbidden('CAMERA_FANMASS_INTERNAL_SECRET is not configured');
  }

  const provided =
    request.headers.get('x-fanmass-secret')?.trim() ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';

  if (!provided || provided !== configured) {
    throw apiForbidden('Invalid fanmass internal secret');
  }
}
