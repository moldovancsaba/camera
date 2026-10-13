'use client';

/**
 * Google / Facebook entry points — same SSO OAuth flow as Amanoba (`provider` on authorize URL). They are drawn in the colours and with the mark of their brand and stand
 * side by side where there is room and one above the other where there is not (camera#462, client feedback: they should stand out). No heading of their own: the page
 * that shows them says what they are for.
 */

import BrandSignInButton from '@/components/auth/BrandSignInButton';
import { socialLoginHref } from '@/lib/auth/social-login';
import { useT } from '@/components/i18n/UiLanguageProvider';
import { useEffect, useRef, useState } from 'react';

export interface SocialLoginButtonsProps {
  /** After logout, force IdP login screen */
  fromLogout?: boolean;
  /** The capture page the login starts on and its step: the login brings the guest back there (lib/auth/capture-return.ts). */
  captureEventId?: string;
  capturePage?: number;
  /** Keep the capture page open while the user signs in, preserving an in-memory photo. */
  capturePopup?: boolean;
  /** A session created by the popup is picked up while this tab keeps the capture in memory. */
  onCaptureLoginComplete?: (user: { name: string; email: string }) => void;
  /** Both buttons are off (the acceptance on the Who-are-you page is not ticked yet). */
  disabled?: boolean;
}

export default function SocialLoginButtons({ fromLogout, captureEventId, capturePage, capturePopup = false, onCaptureLoginComplete, disabled = false }: SocialLoginButtonsProps) {
  const { t } = useT();
  const [popupError, setPopupError] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const completed = useRef(false);
  const googleHref = socialLoginHref('google', { fromLogout, captureEventId, capturePage, capturePopup });
  const facebookHref = socialLoginHref('facebook', { fromLogout, captureEventId, capturePage, capturePopup });

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const openCaptureLogin = (href: string) => {
    setPopupError(false);
    const popup = window.open(href, '_blank', 'popup,width=520,height=720');
    if (!popup) {
      setPopupError(true);
      return;
    }
    if (timer.current) clearInterval(timer.current);
    completed.current = false;
    const startedAt = Date.now();
    // OAuth can replace the popup's browsing context at the identity provider; polling the app session works even when the browser isolates its opener.
    timer.current = setInterval(async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const session = await response.json();
        if (!completed.current && response.ok && session.authenticated && session.user) {
          completed.current = true;
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          popup.close();
          onCaptureLoginComplete?.({ name: session.user.name || '', email: session.user.email || '' });
          return;
        }
      } catch {
        // The original capture page remains usable while a temporary session read fails.
      }
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setPopupError(true);
      }
    }, 1500);
  };

  return (
    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
      <BrandSignInButton provider="google" href={googleHref} label={t('social.google.aria')} disabled={disabled} openInNewTab={capturePopup} onPopupClick={openCaptureLogin} />
      <BrandSignInButton provider="facebook" href={facebookHref} label={t('social.facebook.aria')} disabled={disabled} openInNewTab={capturePopup} onPopupClick={openCaptureLogin} />
      {popupError ? <div role="alert" style={{ gridColumn: '1 / -1', color: 'var(--mantine-color-red-7)', textAlign: 'center' }}>{t('login.popupError')}</div> : null}
    </div>
  );
}
