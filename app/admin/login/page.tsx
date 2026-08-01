// app/admin/login/page.tsx - dedicated SSO-only admin sign-in entry point.
// WHAT: The only page that decides "sign in via SSO" for camera's admin
//     area. Auto-redirects straight to SSO when there's nothing to explain;
//     only renders when it has to (an SSO/callback error to surface).
// WHY: Camera used to make this decision on the public homepage (`/`),
//     coupling the admin auth flow to a page that should just be a plain
//     public landing page -- mirrors messmass's app/admin/login/page.tsx,
//     the proven pattern for this shared SSO ecosystem.

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { AuthShell } from '@/components/gds/ClientWrappers';
import { Button, Stack, Text } from '@/components/gds/PublicPrimitives';

export const dynamic = 'force-dynamic';

function oauthErrorHint(code: string | undefined): string | null {
  if (!code) return null;
  if (code === 'session_expired') {
    return 'Use a single browser tab for sign-in, or try again from the capture page.';
  }
  if (code === 'invalid_state') {
    return 'If you had multiple login tabs open, close the extras and start sign-in once.';
  }
  if (code === 'no_access') {
    return 'Contact an admin to request access to this app.';
  }
  return null;
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const session = await getSession();
  // WHAT: only treat this as "already signed in, skip to /admin" when the
  //     session actually has access.
  // WHY: camera's OAuth callback (unlike messmass's) still creates a
  //     session for a user without app access -- it just carries
  //     appAccess: false. Redirecting that session straight back to
  //     /admin here would immediately fail the admin layout's own access
  //     check, which redirects back to this exact page: a loop.
  if (session && session.appAccess !== false) {
    redirect('/admin');
  }

  const params = await searchParams;
  const oauthError = params.error;
  let oauthMessage: string | null = null;
  if (params.message) {
    try {
      oauthMessage = decodeURIComponent(params.message);
    } catch {
      oauthMessage = params.message;
    }
  }

  // Nothing to explain -- go straight to the real sign-in page. The
  // post-logout cookie (set by /api/auth/logout) makes /api/auth/login add
  // prompt=login automatically when this follows a logout, without needing
  // a query param threaded through here.
  if (!oauthError && !oauthMessage) {
    redirect('/api/auth/login');
  }

  const oauthHint = oauthErrorHint(oauthError);
  const signInError = (
    <Stack gap="xs">
      {oauthMessage ? <Text>{oauthMessage}</Text> : null}
      {!oauthMessage && oauthError && (
        <Text tt="capitalize">{oauthError.replace(/_/g, ' ')}</Text>
      )}
      {oauthHint ? <Text>{oauthHint}</Text> : null}
    </Stack>
  );

  return (
    <AuthShell title="Camera" description="Sign in with your approved account." intent="sign-in" error={signInError}>
      <Stack align="center" gap="md" w="100%">
        <Button component="a" href="/api/auth/login" size="lg" fullWidth>
          Sign In
        </Button>
      </Stack>
    </AuthShell>
  );
}
