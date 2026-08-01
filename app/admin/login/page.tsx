'use client';

// app/admin/login/page.tsx - dedicated SSO-only admin sign-in entry point.
// WHAT: The only page that decides "sign in via SSO" for camera's admin
//     area. Auto-redirects straight to SSO when there's nothing to explain;
//     only renders when it has to (an SSO/callback error to surface).
// WHY: Camera used to make this decision on the public homepage (`/`),
//     coupling the admin auth flow to a page that should just be a plain
//     public landing page -- mirrors messmass's app/admin/login/page.tsx,
//     the proven pattern for this shared SSO ecosystem.
//
// WHAT: This is a client component that decides where to go via a client
//     fetch + window.location.replace(), NOT a Server Component redirect()
//     call.
// WHY: A Server Component redirect() issued after an `await` (here it was
//     `await getSession()`) can't send a real HTTP 3xx -- Next.js falls
//     back to a 200 response carrying an RSC "soft redirect" digest, which
//     the client router then has to follow. When that soft redirect's
//     target is itself a Route Handler (/api/auth/login) that issues a
//     further HTTP redirect to an external origin (SSO), the client
//     router's RSC-fetch-based navigation doesn't reliably follow it --
//     this manifested in production as this page reloading itself
//     indefinitely without ever reaching SSO. window.location.replace()
//     triggers a genuine top-level browser navigation, which follows
//     cross-origin HTTP redirects the normal way with no special handling
//     needed. This is exactly the pattern messmass's equivalent page
//     already uses.

import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/gds/ClientWrappers';
import { Button, Stack, Text } from '@/components/gds/PublicPrimitives';

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

export default function AdminLoginPage() {
  const [redirecting, setRedirecting] = useState(true);
  const [signInError, setSignInError] = useState<React.ReactNode>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error') ?? undefined;
    let oauthMessage: string | null = null;
    const rawMessage = params.get('message');
    if (rawMessage) {
      try {
        oauthMessage = decodeURIComponent(rawMessage);
      } catch {
        oauthMessage = rawMessage;
      }
    }

    const check = async () => {
      // WHAT: an error/message param always wins over the "already signed
      //     in" fast path below -- never fetched or overridden by it.
      // WHY: this page can be reached with ?error=no_access after the edge
      //     or the admin layout already decided this exact session
      //     shouldn't be on /admin. If the "already signed in" check below
      //     ran first and disagreed (e.g. from a stale cached cookie
      //     value), it would silently bounce straight back to /admin,
      //     which would bounce back here again: an infinite loop. Trusting
      //     an explicit error param unconditionally makes that fail safe
      //     (a visible error screen) instead of failing spinny.
      if (!oauthError && !oauthMessage) {
        try {
          const res = await fetch('/api/auth/session');
          const data = await res.json();
          // WHAT: only treat this as "already signed in, skip to /admin"
          //     when the session actually has access.
          // WHY: camera's OAuth callback (unlike messmass's) still creates
          //     a session for a user without app access -- it just carries
          //     appAccess: false. Sending that session to /admin here would
          //     immediately fail the admin layout's own access check,
          //     which redirects back to this exact page: a loop.
          if (data.authenticated && data.appAccess !== false) {
            window.location.replace('/admin');
            return;
          }
        } catch {
          // Treat an unreachable session check as "not signed in" and fall
          // through to the sign-in path below.
        }

        // Nothing to explain -- go straight to the real sign-in page. The
        // post-logout cookie (set by /api/auth/logout) makes
        // /api/auth/login add prompt=login automatically when this follows
        // a logout, without needing a query param threaded through here.
        window.location.replace('/api/auth/login');
        return;
      }

      const oauthHint = oauthErrorHint(oauthError);
      setSignInError(
        <Stack gap="xs">
          {oauthMessage ? <Text>{oauthMessage}</Text> : null}
          {!oauthMessage && oauthError && (
            <Text tt="capitalize">{oauthError.replace(/_/g, ' ')}</Text>
          )}
          {oauthHint ? <Text>{oauthHint}</Text> : null}
        </Stack>
      );
      setRedirecting(false);
    };

    check();
  }, []);

  if (redirecting) return null;

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
