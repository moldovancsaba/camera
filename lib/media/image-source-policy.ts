import { isAllowedLogoUrl } from '@/lib/frame/logo';
import { isRenderableImgbbImageUrl } from '@/lib/imgbb/url';

/** Server-side health probes may inspect backup copies; this does not make those addresses eligible for browser rendering. */
export function isProbeableStoredImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (isAllowedLogoUrl(raw) || isRenderableImgbbImageUrl(raw));
  } catch {
    return false;
  }
}
