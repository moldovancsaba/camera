'use client';

/**
 * Google / Facebook entry points — same SSO OAuth flow as Amanoba (`provider` on authorize URL). Two buttons side by side, with no
 * heading of their own: the page that shows them says what they are for.
 */

import { SimpleGrid } from '@mantine/core';
import { ProviderIdentityButton } from '@sovereignsquad/gds-core/client';

import { socialLoginHref } from '@/lib/auth/social-login';
import { useT } from '@/components/i18n/UiLanguageProvider';

export interface SocialLoginButtonsProps {
  /** After logout, force IdP login screen */
  fromLogout?: boolean;
  /** The capture page the login starts on and its step: the login brings the guest back there (lib/auth/capture-return.ts). */
  captureEventId?: string;
  capturePage?: number;
}

export default function SocialLoginButtons({ fromLogout, captureEventId, capturePage }: SocialLoginButtonsProps) {
  const { t } = useT();
  const googleHref = socialLoginHref('google', { fromLogout, captureEventId, capturePage });
  const facebookHref = socialLoginHref('facebook', { fromLogout, captureEventId, capturePage });

  return (
    <SimpleGrid cols={2} spacing="sm">
      <ProviderIdentityButton provider="google" href={googleHref} label="Google" ariaLabel={t('social.google.aria')} size="sm" />
      <ProviderIdentityButton provider="facebook" href={facebookHref} label="Facebook" ariaLabel={t('social.facebook.aria')} size="sm" />
    </SimpleGrid>
  );
}
