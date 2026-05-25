/**
 * Camera Webapp - Homepage
 * 
 * Main landing page for photo capture with frames.
 * Shows login status and provides authentication controls.
 */

import { getSession } from '@/lib/auth/session';
import Image from 'next/image';
import { APP_VERSION } from '@/lib/app-version';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import PublicShell from '@/components/gds/PublicShell';
import { Alert, Badge, Button, Group, Stack, Text, Title } from '@mantine/core';

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
  
  return (
    <PublicShell size="md" centered>
      <Stack align="center" justify="center" gap="xl" py="xl">
        {oauthError && !session && (
          <Alert
            color="red"
            title="Sign-in did not complete"
            maw={560}
            w="100%"
            styles={{ body: { textAlign: 'left' } }}
            role="alert"
          >
            {oauthMessage ? <Text mt="xs">{oauthMessage}</Text> : null}
            {!oauthMessage && (
              <Text mt="xs" tt="capitalize">
                {oauthError.replace(/_/g, ' ')}
              </Text>
            )}
            {oauthHint ? <Text mt="xs">{oauthHint}</Text> : null}
          </Alert>
        )}
        <Stack align="center" gap="md">
          <Group align="center" gap="md" wrap="nowrap">
            <Image
              src="https://i.ibb.co/zTG7ztxC/camera-logo.png"
              alt="Camera Logo"
              width={192}
              height={64}
              unoptimized
              style={{ height: 64, width: 'auto' }}
            />
            <Title order={1} fz={{ base: 44, md: 64 }} c="dark.8">
              Camera
            </Title>
          </Group>

          {session && (
            <Badge color="green" size="lg" variant="light" styles={{ root: { paddingInline: 16, paddingBlock: 18 } }}>
              <Text size="sm" c="green.9">
                ✓ Logged in as <strong>{session.user.email}</strong>
              </Text>
            </Badge>
          )}
        </Stack>

        <Stack align="center" gap="md" w="100%">
          {session ? (
            <>
              {(session.appRole === 'admin' || session.appRole === 'superadmin') && (
                <Button component="a" href="/admin" size="lg" color="cameraTeal">
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

        <Stack align="center" gap={4}>
          <Text size="sm" c="dimmed" ta="center">
            🔐 Google / Facebook via SSO | ☁️ MongoDB Atlas | 🖼️ imgbb
          </Text>
          <Text size="xs" c="dimmed" ff="monospace">
            v{APP_VERSION}
          </Text>
        </Stack>
      </Stack>
    </PublicShell>
  );
}
