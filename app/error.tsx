/**
 * Global Error Boundary
 *
 * Catches and displays errors in a user-friendly way.
 */

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AppButton } from '@/components/ui/AppButton';
import { Button } from '@/components/gds/ui';

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
      <div className="app-raised-dialog">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="app-raised-dialog-title">Oops! Something went wrong</h1>
        <p className="app-raised-dialog-body">
          {error.message || 'An unexpected error occurred. This might be due to a temporary connection issue.'}
        </p>

        <div className="app-raised-dialog-actions">
          <AppButton type="button" variant="primary" onClick={reset}>
            Try again
          </AppButton>
          <Button component={Link} href="/" color="cameraSlate" variant="light" radius="xl">
            Go home
          </Button>
        </div>

        {error.digest ? <p className="app-form-status mt-6">Error ID: {error.digest}</p> : null}
      </div>
    </div>
  );
}
