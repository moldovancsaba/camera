const DIRECT_IMAGE_HOST = 'i.ibb.co';

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function normalizeImgbbDirectUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = safeUrl(trimmed);
  if (!parsed) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

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
  if (parsed.hostname !== DIRECT_IMAGE_HOST) return false;
  // imgbb direct image path should have at least two path segments: /<token>/<name.ext>
  const parts = parsed.pathname.split('/').filter(Boolean);
  return parts.length >= 2;
}
