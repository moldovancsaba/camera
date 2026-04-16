/** Human-readable copy for OAuth failures redirected to `/?error=...&message=...`. */

export function oauthReturnBannerMessage(
  error: string | undefined,
  rawMessage: string | undefined
): string | null {
  if (!error) return null;
  let detail = '';
  if (rawMessage) {
    try {
      detail = decodeURIComponent(rawMessage);
    } catch {
      detail = rawMessage;
    }
  }
  switch (error) {
    case 'session_expired':
      return 'Sign-in timed out or could not finish. Try again and keep this site in one tab.';
    case 'invalid_state':
      return 'Sign-in was interrupted. Close other login tabs and try again.';
    case 'invalid_request':
      return 'Invalid sign-in link. Use Sign in/sign up below and try again.';
    case 'auth_failed':
      return detail ? `Sign-in failed: ${detail}` : 'Sign-in failed. Try again or switch provider.';
    default:
      return detail ? `Sign-in error: ${detail}` : `Sign-in error (${error}). Try again.`;
  }
}
