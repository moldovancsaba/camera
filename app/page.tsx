/**
 * Camera Webapp - Homepage
 * 
 * Main landing page for photo capture with frames.
 * Shows login status and provides authentication controls.
 */

import { getSession } from '@/lib/auth/session';
import { APP_VERSION } from '@/lib/app-version';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import { AuthShell } from '@doneisbetter/gds-core/server';
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
      footer={
        <Stack gap={4} align="center">
          <Text size="sm">Google / Facebook via SSO | MongoDB Atlas | imgbb</Text>
          <Text size="xs" ff="monospace">
            v{APP_VERSION}
          </Text>
        </Stack>
      }
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
          <SocialLoginButtons fromLogout={justLoggedOut} variant="home" />
        )}
      </Stack>
    </AuthShell>
  );
}
