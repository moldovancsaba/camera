import { apiForbidden } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';

/** Dedicated, purpose-limited authentication for SSO's erasure resolver call. */
export function requireCameraPrivacyResolver(request: Request): string {
  const expected = process.env.CAMERA_PRIVACY_RESOLVER_SECRET?.trim();
  const provided = request.headers.get('x-camera-privacy-resolver-secret')?.trim() || '';
  const result = checkSharedSecret(expected, provided);
  if (result !== 'ok') {
    logSharedSecretRejection('privacy subject resolver', 'CAMERA_PRIVACY_RESOLVER_SECRET', result);
    throw apiForbidden();
  }
  return expected as string;
}
