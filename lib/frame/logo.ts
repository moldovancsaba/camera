/**
 * Fetches the logo of the frame (camera#235). The URL comes from the messmass snapshot, so it is checked before it is
 * fetched: https only, only the image hosts camera uses (its own Vercel Blob store, imgbb's direct host and the logo bucket on
 * Cloudflare R2), no redirects, a size cap and a timeout. The image is drawn as it is; nothing is removed from a logo.
 */

import { isBlobStorageHostname, isLogoStorageHostname } from '@/lib/imgbb/url';

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_FETCH_TIMEOUT_MS = 8000;

export function isAllowedLogoUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'i.ibb.co' || isBlobStorageHostname(url.hostname) || isLogoStorageHostname(url.hostname));
  } catch {
    return false;
  }
}

/** The logo's bytes, or null when the URL is not allowed or the download fails, is too large or is not an image. */
export async function fetchLogo(url: string, fetchImpl: typeof fetch = fetch): Promise<Buffer | null> {
  if (!isAllowedLogoUrl(url)) return null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS), redirect: 'error', headers: { Accept: 'image/*' } });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
    if (Number(res.headers.get('content-length') ?? 0) > LOGO_MAX_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length > 0 && bytes.length <= LOGO_MAX_BYTES ? bytes : null;
  } catch {
    return null;
  }
}
