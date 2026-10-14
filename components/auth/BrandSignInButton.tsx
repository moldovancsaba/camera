'use client';

/**
 * A sign-in button in the colours and with the mark of its brand (camera#462, client feedback of 2026-10-09 on the "Who are you" page: the Google and Facebook sign-in
 * should stand out, perhaps in their own colours). Google's rules (Sign in with Google branding guidelines): a white button, a thin grey border, dark text and the
 * four-colour G, which is never recoloured. Facebook: the Facebook blue, white text and the white f. Both are at least 48 px tall, one line, with the mark first.
 */

import type { ReactNode } from 'react';
import {
  CAMERA_STAGE_WHITE,
  SOCIAL_FACEBOOK_BLUE,
  SOCIAL_GOOGLE_BLUE,
  SOCIAL_GOOGLE_BUTTON_FILL,
  SOCIAL_GOOGLE_BUTTON_STROKE,
  SOCIAL_GOOGLE_BUTTON_TEXT,
  SOCIAL_GOOGLE_GREEN,
  SOCIAL_GOOGLE_RED,
  SOCIAL_GOOGLE_YELLOW,
} from '@/lib/gds/tokens/colors';

export type BrandProvider = 'google' | 'facebook';

/** The four-colour G, drawn on a 48 x 48 grid. */
function GoogleMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill={SOCIAL_GOOGLE_RED} d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill={SOCIAL_GOOGLE_BLUE} d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill={SOCIAL_GOOGLE_YELLOW} d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill={SOCIAL_GOOGLE_GREEN} d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** The white f of Facebook, drawn on a 24 x 24 grid. */
function FacebookMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path fill={CAMERA_STAGE_WHITE} d="M13.4 22v-8.2h2.8l.5-3.4h-3.3V8.3c0-1 .3-1.7 1.7-1.7h1.8V3.5c-.3 0-1.4-.1-2.6-.1-2.6 0-4.3 1.6-4.3 4.4v2.6H7.2v3.4H10V22h3.4z" />
    </svg>
  );
}

const LOOK: Record<BrandProvider, { mark: ReactNode; background: string; color: string; border: string }> = {
  google: { mark: <GoogleMark />, background: SOCIAL_GOOGLE_BUTTON_FILL, color: SOCIAL_GOOGLE_BUTTON_TEXT, border: `1px solid ${SOCIAL_GOOGLE_BUTTON_STROKE}` },
  facebook: { mark: <FacebookMark />, background: SOCIAL_FACEBOOK_BLUE, color: CAMERA_STAGE_WHITE, border: `1px solid ${SOCIAL_FACEBOOK_BLUE}` },
};

export default function BrandSignInButton({ provider, href, label, disabled = false }: { provider: BrandProvider; href: string; label: string; disabled?: boolean }) {
  const look = LOOK[provider];
  return (
    <a
      // A disabled button has no address: nothing to follow with a tap, a key or a long press, and the page says so to a screen reader (the acceptance on the Who-are-you page, issue 523).
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      role={disabled ? 'link' : undefined}
      data-brand-signin={provider}
      className="brand-signin"
      style={{
        alignItems: 'center',
        background: look.background,
        border: look.border,
        borderRadius: 999,
        boxSizing: 'border-box',
        color: look.color,
        display: 'flex',
        fontFamily: 'Roboto, system-ui, -apple-system, "Segoe UI", sans-serif',
        fontSize: 16,
        fontWeight: 600,
        gap: 12,
        justifyContent: 'center',
        minHeight: 48,
        opacity: disabled ? 0.45 : 1,
        padding: '0 20px',
        pointerEvents: disabled ? 'none' : undefined,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        width: '100%',
      }}
    >
      {look.mark}
      <span>{label}</span>
    </a>
  );
}
