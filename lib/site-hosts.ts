/**
 * Multi-hostname routing (same Next.js app on Vercel).
 * Defaults target messmass.com; override with CAMERA_HOSTNAMES / GO_SHORT_HOSTNAMES (comma-separated).
 */

function parseHostList(envVal: string | undefined, fallbacks: string[]): string[] {
  const raw = envVal
    ?.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return raw?.length ? raw : fallbacks;
}

/** Hostnames treated as the primary Camera marketing / capture site (optional redirects). */
export const CAMERA_HOSTNAMES = parseHostList(process.env.CAMERA_HOSTNAMES, [
  'camera.messmass.com',
  'www.camera.messmass.com',
]);

/** Short-link hostnames: `/slug` rewrites to `/api/go-short/[slug]` → redirect to capture URL. */
export const GO_SHORT_HOSTNAMES = parseHostList(process.env.GO_SHORT_HOSTNAMES, [
  'go.messmass.com',
  'www.go.messmass.com',
]);

export function hostnameFromHostHeader(host: string | null | undefined): string {
  if (!host) return '';
  return host.split(',')[0].trim().split(':')[0].toLowerCase();
}

export function isCameraHost(host: string | null | undefined): boolean {
  return CAMERA_HOSTNAMES.includes(hostnameFromHostHeader(host));
}

export function isGoShortHost(host: string | null | undefined): boolean {
  return GO_SHORT_HOSTNAMES.includes(hostnameFromHostHeader(host));
}

export function defaultCameraOrigin(): string {
  return (process.env.NEXT_PUBLIC_CAMERA_ORIGIN || 'https://camera.messmass.com').replace(/\/$/, '');
}

/** Public base URL for short links (admin preview). */
export function defaultGoShortOrigin(): string {
  return (process.env.NEXT_PUBLIC_GO_ORIGIN || 'https://go.messmass.com').replace(/\/$/, '');
}
