'use client';

/**
 * Google / Facebook entry points — same SSO OAuth flow as Amanoba (`provider` on authorize URL). They are drawn in the colours and with the mark of their brand and stand
 * side by side where there is room and one above the other where there is not (camera#462, client feedback: they should stand out). No heading of their own: the page
 * that shows them says what they are for.
 */

import BrandSignInButton from '@/components/auth/BrandSignInButton';
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
    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
      <BrandSignInButton provider="google" href={googleHref} label={t('social.google.aria')} />
      <BrandSignInButton provider="facebook" href={facebookHref} label={t('social.facebook.aria')} />
    </div>
  );
}
