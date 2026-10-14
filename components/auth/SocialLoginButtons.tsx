'use client';

/**
 * Google / Facebook entry points — same SSO OAuth flow as Amanoba (`provider` on authorize URL). They are drawn in the colours and with the mark of their brand and stand
 * side by side where there is room and one above the other where there is not (camera#462, client feedback: they should stand out). No heading of their own: the page
 * that shows them says what they are for.
 */

import BrandSignInButton from '@/components/auth/BrandSignInButton';
import { socialLoginHref } from '@/lib/auth/social-login';
import { journey } from '@/lib/journey/client';
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
  const channel = useRef<BroadcastChannel | null>(null);
  const popup = useRef<Window | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const googleHref = socialLoginHref('google', { fromLogout, captureEventId, capturePage });
  const facebookHref = socialLoginHref('facebook', { fromLogout, captureEventId, capturePage });

  useEffect(() => () => {
    channel.current?.close();
    popup.current?.close();
    if (timeout.current) clearTimeout(timeout.current);
  }, []);

  const openCaptureLogin = (provider: 'google' | 'facebook') => {
    setPopupError(false);
    channel.current?.close();
    popup.current?.close();
    if (timeout.current) clearTimeout(timeout.current);
    const popupId = crypto.randomUUID();
    const href = socialLoginHref(provider, { fromLogout, captureEventId, capturePage, capturePopup: popupId });
    const opened = window.open(href, '_blank', 'popup,width=520,height=720');
    if (!opened) {
      setPopupError(true);
      return;
    }
    popup.current = opened;
    const returnChannel = new BroadcastChannel(`camera-social-login:${popupId}`);
    channel.current = returnChannel;
    returnChannel.onmessage = async (event: MessageEvent<{ type?: string; popupId?: string; status?: string }>) => {
      if (event.data?.type !== 'camera-social-login' || event.data.popupId !== popupId) return;
      returnChannel.close();
      channel.current = null;
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = null;
      if (event.data.status !== 'completed') {
        setPopupError(true);
        return;
      }
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const session = await response.json();
        if (response.ok && session.authenticated && session.user) {
          // Count the popup's successful return too; a full-page return is counted when the capture page resumes.
          journey.record('journey.resume');
          popup.current?.close();
          popup.current = null;
          onCaptureLoginComplete?.({ name: session.user.name || '', email: session.user.email || '' });
          return;
        }
      } catch {
        // The original capture page remains usable if the session read fails.
      }
      setPopupError(true);
    };
    // The unique callback signal prevents a previous guest's still-valid session from resuming this photo.
    timeout.current = setTimeout(() => {
      returnChannel.close();
      if (channel.current === returnChannel) channel.current = null;
      popup.current?.close();
      popup.current = null;
      setPopupError(true);
    }, 15 * 60 * 1000);
  };

  return (
    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
      <BrandSignInButton provider="google" href={googleHref} label={t('social.google.aria')} disabled={disabled} openInNewTab={capturePopup} onPopupClick={() => openCaptureLogin('google')} />
      <BrandSignInButton provider="facebook" href={facebookHref} label={t('social.facebook.aria')} disabled={disabled} openInNewTab={capturePopup} onPopupClick={() => openCaptureLogin('facebook')} />
      {popupError ? <div role="alert" style={{ gridColumn: '1 / -1', color: 'var(--mantine-color-red-7)', textAlign: 'center' }}>{t('login.popupError')}</div> : null}
    </div>
  );
}
