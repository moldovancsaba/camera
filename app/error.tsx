/**
 * Global Error Boundary
 *
 * Catches and displays errors in a user-friendly way.
 */

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, Stack, Text } from '@mantine/core';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-4">
      <Stack
        gap="md"
        align="center"
        className="w-full max-w-xl rounded-3xl border border-white/10 bg-black/80 p-8 text-center shadow-2xl backdrop-blur-xl"
      >
        <div className="text-6xl mb-4">⚠️</div>
        <Text component="h1" size="xl" fw={800} c="white">
          Oops! Something went wrong
        </Text>
        <Text c="gray.3">
          {error.message || 'An unexpected error occurred. This might be due to a temporary connection issue.'}
        </Text>

        <Stack gap="sm" w="100%">
          <Button type="button" color="teal" radius="xl" onClick={reset}>
            Try again
          </Button>
          <Button component={Link} href="/" color="gray" variant="light" radius="xl">
            Go home
          </Button>
        </Stack>

        {error.digest ? (
          <Text size="sm" c="gray.5">
            Error ID: {error.digest}
          </Text>
        ) : null}
      </Stack>
    </div>
  );
}
