import { apiForbidden } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';

/**
 * Service-to-service auth for the savetheworld provisioning API, mirroring
 * assertInternalMessmassSecret / assertInternalFanmassSecret. savetheworld
 * calls these endpoints with a shared secret to create/link camera records
 * for its pledge campaign. Accepts `x-savetheworld-secret` or Bearer.
 *
 * Constant-time compare, fails closed when the env secret is unset, and every
 * rejection is a bare 403 "Forbidden"; the reason goes to the server log only
 * (see lib/security/safeEqual.ts).
 */
export function assertInternalSavetheworldSecret(request: Request): void {
  const provided =
    request.headers.get('x-savetheworld-secret')?.trim() ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';
  const result = checkSharedSecret(process.env.CAMERA_SAVETHEWORLD_INTERNAL_SECRET?.trim(), provided);
  if (result !== 'ok') {
    logSharedSecretRejection('savetheworld internal API', 'CAMERA_SAVETHEWORLD_INTERNAL_SECRET', result);
    throw apiForbidden();
  }
}

/**
 * Public capture URL for a camera event, as shared with savetheworld.
 * Returns null when NEXT_PUBLIC_APP_URL is not configured.
 */
export function buildCaptureUrl(mongoId: string): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || '';
  return appUrl ? `${appUrl}/capture/${mongoId}` : null;
}
