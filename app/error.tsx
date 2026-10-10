/**
 * Global Error Boundary
 *
 * Catches and displays errors in a user-friendly way.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { translate, type UiLanguage } from '@/lib/i18n';
import { browserLanguage } from '@/lib/i18n/browser';
import { Button, Card, Center, Stack, Text } from '@/components/gds/PublicPrimitives';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // This page sits above the event and does not know its language: the browser's own decides (Hungarian for a Hungarian browser, else English; issue 352).
  const [language, setLanguage] = useState<UiLanguage>('en');
  useEffect(() => {
    setLanguage(browserLanguage(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []));
  }, []);
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
          {translate(language, 'errorPage.title')}
        </Text>
        <Text c="dimmed" ta="center">
          {error.message || translate(language, 'errorPage.fallback')}
        </Text>

        <Stack gap="sm" w="100%">
          <Button type="button" radius="xl" onClick={reset}>
            {translate(language, 'errorPage.tryAgain')}
          </Button>
          <Button component={Link} href="/" variant="light" radius="xl">
            {translate(language, 'errorPage.goHome')}
          </Button>
        </Stack>

        {error.digest ? (
          <Text size="sm" c="dimmed">
            {translate(language, 'errorPage.errorId', { id: error.digest })}
          </Text>
        ) : null}
        </Stack>
      </Card>
    </Center>
  );
}
