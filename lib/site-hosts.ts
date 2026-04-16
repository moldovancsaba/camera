/**
 * Multi-hostname routing (same Next.js app on Vercel).
 * Defaults target messmass.com; override with FFF_HOSTNAMES / CAMERA_HOSTNAMES (comma-separated).
 */

function parseHostList(envVal: string | undefined, fallbacks: string[]): string[] {
  const raw = envVal
    ?.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return raw?.length ? raw : fallbacks;
}

/** Hostnames that show the FunFitFan (FFF) landing at `/` (rewritten internally to `/fff`). */
export const FFF_HOSTNAMES = parseHostList(process.env.FFF_HOSTNAMES, [
  'fff.messmass.com',
  'www.fff.messmass.com',
  'funfitfan.messmass.com',
  'www.funfitfan.messmass.com',
]);

/** Hostnames treated as the primary Camera marketing / capture site (optional redirects). */
export const CAMERA_HOSTNAMES = parseHostList(process.env.CAMERA_HOSTNAMES, [
  'camera.messmass.com',
  'www.camera.messmass.com',
]);

export function hostnameFromHostHeader(host: string | null | undefined): string {
  if (!host) return '';
  return host.split(',')[0].trim().split(':')[0].toLowerCase();
}

export function isFffHost(host: string | null | undefined): boolean {
  return FFF_HOSTNAMES.includes(hostnameFromHostHeader(host));
}

export function isCameraHost(host: string | null | undefined): boolean {
  return CAMERA_HOSTNAMES.includes(hostnameFromHostHeader(host));
}

export function defaultFffOrigin(): string {
  return (process.env.NEXT_PUBLIC_FFF_ORIGIN || 'https://fff.messmass.com').replace(/\/$/, '');
}

export function defaultCameraOrigin(): string {
  return (process.env.NEXT_PUBLIC_CAMERA_ORIGIN || 'https://camera.messmass.com').replace(/\/$/, '');
}
