'use client';

/**
 * Google / Facebook entry points — same SSO OAuth flow as Amanoba (`provider` on authorize URL).
 */

import { SocialAuthButtons } from '@sovereignsquad/gds-core/client';

import { socialLoginHref, type SocialLoginProvider } from '@/lib/auth/social-login';

export interface SocialLoginButtonsProps {
  /** After logout, force IdP login screen */
  fromLogout?: boolean;
  /** Before navigating away (e.g. set capture resume cookies) */
  beforeNavigate?: (provider: SocialLoginProvider) => void;
  /** Visual style preset */
  variant?: 'home' | 'capture';
}

export default function SocialLoginButtons({
  fromLogout,
  beforeNavigate,
  variant = 'home',
}: SocialLoginButtonsProps) {
  const googleHref = socialLoginHref('google', { fromLogout });
  const facebookHref = socialLoginHref('facebook', { fromLogout });

  const handleClick = (provider: SocialLoginProvider) =>
    beforeNavigate
      ? () => {
          beforeNavigate(provider);
        }
      : undefined;

  return (
    <SocialAuthButtons
      providers={[
        {
          id: 'google',
          href: googleHref,
          label: 'Continue with Google',
          onClick: handleClick('google'),
        },
        {
          id: 'facebook',
          href: facebookHref,
          label: 'Continue with Facebook',
          onClick: handleClick('facebook'),
        },
      ]}
      layout={variant === 'capture' ? 'stack' : 'grid'}
      compact={variant === 'capture'}
    />
  );
}
