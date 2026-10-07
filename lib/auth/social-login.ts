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

/**
 * Relative path to start OAuth (PKCE) with an optional forced SSO provider. A guest's login names the capture page it started on
 * (`captureEvent`, and `capturePage` for the step), so the callback brings the guest back there (lib/auth/capture-return.ts).
 */
export function socialLoginHref(
  provider: SocialLoginProvider,
  options?: { fromLogout?: boolean; captureEventId?: string; capturePage?: number }
): string {
  const p = new URLSearchParams({ provider });
  if (options?.fromLogout) p.set('from_logout', 'true');
  if (options?.captureEventId) p.set('captureEvent', options.captureEventId);
  if (options?.capturePage !== undefined) p.set('capturePage', String(options.capturePage));
  return `/api/auth/login?${p.toString()}`;
}
