/**
 * Camera Webapp - Homepage
 * 
 * Main landing page for photo capture with frames.
 * Shows login status and provides authentication controls.
 */

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { AuthShell } from '@/components/gds/ClientWrappers';
import { Button, Stack, Text } from '@mantine/core';

// This page uses cookies, so it must be dynamic
export const dynamic = 'force-dynamic';

function oauthErrorHint(code: string | undefined): string | null {
  if (!code) return null;
  if (code === 'session_expired') {
    return 'Use a single browser tab for sign-in, or try again from the capture page.';
  }
  if (code === 'invalid_state') {
    return 'If you had multiple login tabs open, close the extras and start sign-in once.';
  }
  return null;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ logout?: string; error?: string; message?: string }>;
}) {
  // Get current session to show user info
  const session = await getSession();
  
  // Await searchParams (Next.js 15 requires this)
  const params = await searchParams;
  
  // Check if user just logged out
  const justLoggedOut = params.logout === 'success';

  const oauthError = params.error;
  let oauthMessage: string | null = null;
  if (params.message) {
    try {
      oauthMessage = decodeURIComponent(params.message);
    } catch {
      oauthMessage = params.message;
    }
  }

  const loginUrl = justLoggedOut ? '/api/auth/login?from_logout=true' : '/api/auth/login';

  // Nothing to explain -- the real sign-in page lives at sso.doneisbetter.com,
  // and every app in the stack sends users there directly rather than
  // rendering its own login screen. EXCEPTION: right after logout, land here
  // instead of bouncing straight back into SSO -- /api/auth/logout already
  // revoked this app's SSO tokens, but SSO's own browser session is still
  // live, so an immediate auto-redirect would silently sign the user back in
  // and make logout look like it did nothing.
  if (!session && !oauthError && !oauthMessage && !justLoggedOut) {
    redirect(loginUrl);
  }

  const oauthHint = oauthErrorHint(oauthError);
  const signInError = oauthError && !session ? (
    <Stack gap="xs">
      {oauthMessage ? <Text>{oauthMessage}</Text> : null}
      {!oauthMessage && (
        <Text tt="capitalize">
          {oauthError.replace(/_/g, ' ')}
        </Text>
      )}
      {oauthHint ? <Text>{oauthHint}</Text> : null}
    </Stack>
  ) : null;
  
  return (
    <AuthShell
      title="Camera"
      description={session ? 'Choose where to continue.' : 'Sign in with your approved account.'}
      intent="sign-in"
      error={signInError}
      helper={session ? `Logged in as ${session.user.email}` : null}
    >
      <Stack align="center" gap="md" w="100%">
        {session ? (
          <>
            {(session.appRole === 'admin' || session.appRole === 'superadmin') && (
              <Button component="a" href="/admin" size="lg">
                Admin Panel
              </Button>
            )}

            <Button component="a" href="/api/auth/logout" size="lg" variant="default">
              Logout
            </Button>
          </>
        ) : (
          <Button component="a" href={loginUrl} size="lg" fullWidth>
            Sign In
          </Button>
        )}
      </Stack>
    </AuthShell>
  );
}
