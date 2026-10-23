import { apiError, apiForbidden } from '@/lib/api';
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

/** Separate encryption key so rotating the caller credential cannot strand pending media deletions. */
export function requireCameraPrivacyMediaKey(): string {
  const key = process.env.CAMERA_PRIVACY_MEDIA_KEY?.trim();
  if (!key || Buffer.byteLength(key, 'utf8') < 32) {
    throw apiError('Privacy media-erasure key is not configured', 503, { reason_code: 'media_erasure_key_unavailable' });
  }
  return key;
}
