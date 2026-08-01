/**
 * Camera Webapp - Homepage
 *
 * Plain public landing page -- never gated, never redirects based on
 * session state. All sign-in decisions live at /admin/login, mirroring
 * messmass's landing-page + dedicated-admin-login split. This is
 * deliberate: coupling this page to auth state (as it used to be) meant
 * any client- or session-state edge case here could bounce a visitor
 * straight back into SSO, which is exactly how the login/logout loop this
 * page used to have came about.
 */

import { AuthShell } from '@/components/gds/ClientWrappers';
import { Button, Stack } from '@mantine/core';

export default function Home() {
  return (
    <AuthShell title="Camera" description="Event photo capture with frames." intent="sign-in">
      <Stack align="center" gap="md" w="100%">
        <Button component="a" href="/admin/login" size="lg" fullWidth>
          Admin Login
        </Button>
      </Stack>
    </AuthShell>
  );
}
