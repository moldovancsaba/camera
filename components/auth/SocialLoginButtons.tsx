'use client';

/**
 * Google / Facebook entry points — same SSO OAuth flow as Amanoba (`provider` on authorize URL). Two buttons side by side, with no
 * heading of their own: the page that shows them says what they are for.
 */

import type { MouseEvent } from 'react';
import { SimpleGrid } from '@mantine/core';
import { ProviderIdentityButton } from '@sovereignsquad/gds-core/client';

import { socialLoginHref, type SocialLoginProvider } from '@/lib/auth/social-login';

export interface SocialLoginButtonsProps {
  /** After logout, force IdP login screen */
  fromLogout?: boolean;
  /** Before navigating away (e.g. set capture resume cookies) */
  beforeNavigate?: (provider: SocialLoginProvider) => void;
}

export default function SocialLoginButtons({
  fromLogout,
  beforeNavigate,
}: SocialLoginButtonsProps) {
  const googleHref = socialLoginHref('google', { fromLogout });
  const facebookHref = socialLoginHref('facebook', { fromLogout });

  // The GDS button drops `onClick` whenever it has an `href`, so the click is caught on the wrapper (capture phase, before the
  // browser follows the link). Without this the capture resume cookies were never set and a login ended on /admin (camera#284).
  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!beforeNavigate) return;
    const link = (event.target as HTMLElement).closest('a');
    if (!link) return;
    let provider: string | null = null;
    try {
      provider = new URL(link.href, window.location.origin).searchParams.get('provider');
    } catch {
      return;
    }
    if (provider === 'google' || provider === 'facebook') beforeNavigate(provider);
  };

  return (
    <div onClickCapture={handleClickCapture}>
      <SimpleGrid cols={2} spacing="sm">
        <ProviderIdentityButton provider="google" href={googleHref} label="Google" ariaLabel="Continue with Google" size="sm" />
        <ProviderIdentityButton provider="facebook" href={facebookHref} label="Facebook" ariaLabel="Continue with Facebook" size="sm" />
      </SimpleGrid>
    </div>
  );
}
