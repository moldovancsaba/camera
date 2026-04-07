/**
 * Social login entry helpers (Google / Facebook via central SSO).
 * Matches the pattern used in Amanoba: authorize URL includes `provider=google|facebook`.
 */

export type SocialLoginProvider = 'google' | 'facebook';

export function parseLoginProvider(
  value: string | null | undefined
): SocialLoginProvider | undefined {
  if (value == null || value === '') return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'google' || v === 'facebook') return v;
  return undefined;
}

/** Relative path to start OAuth (PKCE) with an optional forced SSO provider. */
export function socialLoginHref(
  provider: SocialLoginProvider,
  options?: { fromLogout?: boolean }
): string {
  const p = new URLSearchParams({ provider });
  if (options?.fromLogout) p.set('from_logout', 'true');
  return `/api/auth/login?${p.toString()}`;
}
