const DIRECT_IMAGE_HOST = 'i.ibb.co';

// Vercel Blob public URLs: https://<random-store-id>.public.blob.vercel-storage.com/<pathname>
// The store-id subdomain is generated at store-creation time, so this must be
// a suffix match rather than a literal hostname.
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function isBlobStorageHostname(hostname: string): boolean {
  return hostname.endsWith(BLOB_HOST_SUFFIX);
}

export function normalizeImgbbDirectUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = safeUrl(trimmed);
  if (!parsed) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  if (isBlobStorageHostname(parsed.hostname)) {
    parsed.protocol = 'https:';
    parsed.hash = '';
    return parsed.toString();
  }

  // `ibb.co` links are viewer/delete pages, not hotlink-safe direct image assets.
  if (parsed.hostname === 'ibb.co' || parsed.hostname.endsWith('.ibb.co') === false) {
    return null;
  }

  parsed.protocol = 'https:';
  parsed.hash = '';
  return parsed.toString();
}

export function isRenderableImgbbImageUrl(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const parsed = safeUrl(raw.trim());
  if (!parsed) return false;
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  if (isBlobStorageHostname(parsed.hostname)) {
    // Blob pathnames are a single flat segment (no /<token>/<name> shape) --
    // just confirm there's a real path beyond '/'.
    return parsed.pathname.length > 1;
  }

  if (parsed.hostname !== DIRECT_IMAGE_HOST) return false;
  // imgbb direct image path should have at least two path segments: /<token>/<name.ext>
  const parts = parsed.pathname.split('/').filter(Boolean);
  return parts.length >= 2;
}

export function detectImageProvider(raw: string | null | undefined): 'blob' | 'imgbb' | null {
  if (!raw || typeof raw !== 'string') return null;
  const parsed = safeUrl(raw.trim());
  if (!parsed) return null;
  if (isBlobStorageHostname(parsed.hostname)) return 'blob';
  if (parsed.hostname === DIRECT_IMAGE_HOST) return 'imgbb';
  return null;
}
