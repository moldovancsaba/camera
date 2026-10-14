'use client';

/** Google and Facebook sign-in continue in the current tab and return to the exact guest-journey section. */

import BrandSignInButton from '@/components/auth/BrandSignInButton';
import { socialLoginHref } from '@/lib/auth/social-login';
import { useT } from '@/components/i18n/UiLanguageProvider';

export interface SocialLoginButtonsProps {
  fromLogout?: boolean;
  captureEventId?: string;
  capturePage?: number;
  capturePhase?: 'onboarding' | 'presubmit' | 'thankyou';
  disabled?: boolean;
}

export default function SocialLoginButtons({ fromLogout, captureEventId, capturePage, capturePhase, disabled = false }: SocialLoginButtonsProps) {
  const { t } = useT();
  return (
    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
      <BrandSignInButton
        provider="google"
        href={socialLoginHref('google', { fromLogout, captureEventId, capturePage, capturePhase })}
        label={t('social.google.aria')}
        disabled={disabled}
      />
      <BrandSignInButton
        provider="facebook"
        href={socialLoginHref('facebook', { fromLogout, captureEventId, capturePage, capturePhase })}
        label={t('social.facebook.aria')}
        disabled={disabled}
      />
    </div>
  );
}
