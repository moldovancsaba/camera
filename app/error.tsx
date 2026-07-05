/**
 * Global Error Boundary
 *
 * Catches and displays errors in a user-friendly way.
 */

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, Center, Stack, Text } from '@/components/gds/PublicPrimitives';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
    // Beacon the crash to the server so it lands in structured logs / alerting
    // (#83). In production only `digest` is populated on the client; that's
    // enough to correlate with the full server-side stack Next already logs.
    try {
      const body = JSON.stringify({
        digest: error.digest,
        message: error.message,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      });
      const endpoint = '/api/observability/client-error';
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      } else {
        void fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Never let error reporting throw inside the error boundary.
    }
  }, [error]);

  return (
    <Center mih="100dvh" p="md">
      <Card withBorder radius="xl" p="xl" maw={560} w="100%">
        <Stack gap="md" align="center">
        <Text fz="3rem" aria-hidden>⚠️</Text>
        <Text component="h1" size="xl" fw={800} ta="center">
          Oops! Something went wrong
        </Text>
        <Text c="dimmed" ta="center">
          {error.message || 'An unexpected error occurred. This might be due to a temporary connection issue.'}
        </Text>

        <Stack gap="sm" w="100%">
          <Button type="button" radius="xl" onClick={reset}>
            Try again
          </Button>
          <Button component={Link} href="/" variant="light" radius="xl">
            Go home
          </Button>
        </Stack>

        {error.digest ? (
          <Text size="sm" c="dimmed">
            Error ID: {error.digest}
          </Text>
        ) : null}
        </Stack>
      </Card>
    </Center>
  );
}
