'use client';

/**
 * Google / Facebook entry points — same SSO OAuth flow as Amanoba (`provider` on authorize URL). They are drawn in the colours and with the mark of their brand and stand
 * side by side where there is room and one above the other where there is not (camera#462, client feedback: they should stand out). No heading of their own: the page
 * that shows them says what they are for.
 */

import BrandSignInButton from '@/components/auth/BrandSignInButton';
import { socialLoginHref } from '@/lib/auth/social-login';
import { useT } from '@/components/i18n/UiLanguageProvider';
import { useState, type MouseEvent } from 'react';

export interface SocialLoginButtonsProps {
  /** After logout, force IdP login screen */
  fromLogout?: boolean;
  /** The capture page the login starts on and its step: the login brings the guest back there (lib/auth/capture-return.ts). */
  captureEventId?: string;
  capturePage?: number;
  capturePhase?: 'onboarding' | 'presubmit';
  /** Presubmit sign-in persists the current photo before the same-tab SSO redirect. */
  onBeforeCaptureLogin?: () => Promise<boolean>;
  /** Both buttons are off (the acceptance on the Who-are-you page is not ticked yet). */
  disabled?: boolean;
}

export default function SocialLoginButtons({ fromLogout, captureEventId, capturePage, capturePhase, onBeforeCaptureLogin, disabled = false }: SocialLoginButtonsProps) {
  const { t } = useT();
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState(false);
  const googleHref = socialLoginHref('google', { fromLogout, captureEventId, capturePage, capturePhase });
  const facebookHref = socialLoginHref('facebook', { fromLogout, captureEventId, capturePage, capturePhase });

  const followSso = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onBeforeCaptureLogin || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (disabled || preparing) return;
    const href = event.currentTarget.href;
    setPrepareError(false);
    setPreparing(true);
    try {
      if (await onBeforeCaptureLogin()) window.location.assign(href);
      else setPrepareError(true);
    } catch {
      setPrepareError(true);
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
      <BrandSignInButton provider="google" href={googleHref} label={t('social.google.aria')} disabled={disabled || preparing} onClick={followSso} />
      <BrandSignInButton provider="facebook" href={facebookHref} label={t('social.facebook.aria')} disabled={disabled || preparing} onClick={followSso} />
      {preparing ? <div role="status" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>{t('login.preparingPhoto')}</div> : null}
      {prepareError ? <div role="alert" style={{ gridColumn: '1 / -1', color: 'var(--mantine-color-red-7)', textAlign: 'center' }}>{t('login.captureBackupError')}</div> : null}
    </div>
  );
}
