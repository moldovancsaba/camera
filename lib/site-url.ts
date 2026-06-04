import { headers } from 'next/headers';

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function withProtocol(hostname: string): string {
  const trimmed = hostname.trim();
  if (!trimmed) {
    return trimmed;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getConfiguredSiteUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.SITE_URL;
  if (explicit) {
    return normalizeUrl(explicit);
  }

  const vercelUrl = process.env.VERCEL_URL || process.env.VERCEL_BRANCH_URL || process.env.VERCEL_DEPLOYMENT_URL;
  if (vercelUrl) {
    return normalizeUrl(withProtocol(vercelUrl));
  }

  return process.env.NODE_ENV === 'production'
    ? 'https://camera.doneisbetter.com'
    : 'http://localhost:3000';
}

/** Absolute site URL for the current request (share links, redirects). */
export async function getSiteUrlFromRequest(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  if (host) return `${proto}://${host}`;
  return getConfiguredSiteUrl();
}
