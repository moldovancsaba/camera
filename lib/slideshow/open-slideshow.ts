import { defaultCameraOrigin } from '@/lib/site-hosts';

function isInstalledDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* ignore */
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
  } catch {
    return false;
  }
}

/**
 * Opens `/slideshow/:id` in a new tab (`noopener,noreferrer`).
 *
 * When FunFitFan runs as an **installed PWA** (standalone / iOS home screen), same-origin
 * `window.open` often stays inside the PWA window. If the Camera app origin is configured
 * and differs from the current origin, we open the slideshow there so the OS typically
 * launches the **default browser** tab instead.
 */
export function openSlideshowInNewTab(slideshowId: string): Window | null {
  if (typeof window === 'undefined') return null;
  const path = `/slideshow/${encodeURIComponent(slideshowId)}`;
  const here = window.location.origin.replace(/\/$/, '');
  const camera = defaultCameraOrigin();
  const standalone = isInstalledDisplayMode();
  const canBreakOut =
    standalone &&
    Boolean(camera) &&
    camera !== here &&
    !isLocalDevOrigin(here);
  const url = canBreakOut ? `${camera}${path}` : `${here}${path}`;
  return window.open(url, '_blank', 'noopener,noreferrer');
}
