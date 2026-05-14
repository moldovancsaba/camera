'use client';

import { useMemo, useState } from 'react';

interface Props {
  slug: string;
  enabled: boolean;
  url: string | null;
  buttonText?: string | null;
}

function storageKey(slug: string): string {
  return `landing-cookie-consent:${slug}`;
}

export default function LandingPageCookieConsent({
  slug,
  enabled,
  url,
  buttonText,
}: Props) {
  const [accepted, setAccepted] = useState(() => {
    if (typeof window === 'undefined' || !enabled) return false;
    return window.localStorage.getItem(storageKey(slug)) === 'accepted';
  });
  const [checked, setChecked] = useState(() => {
    if (typeof window === 'undefined' || !enabled) return false;
    return window.localStorage.getItem(storageKey(slug)) === 'accepted';
  });

  const canOpenUrl = useMemo(
    () => !enabled || accepted,
    [accepted, enabled]
  );

  const handleAccept = () => {
    if (!enabled) return;
    if (!checked) return;
    window.localStorage.setItem(storageKey(slug), 'accepted');
    setAccepted(true);
  };

  return (
    <div className="landing-page-actions">
      {enabled ? (
        <div className="landing-page-cookie-consent">
          <label className="landing-page-cookie-row">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="landing-page-cookie-checkbox"
            />
            <span className="landing-page-cookie-copy text-sm leading-6">
              I accept cookies for this landing page and want to continue.
            </span>
          </label>

          <button
            type="button"
            onClick={handleAccept}
            disabled={accepted || !checked}
            className="landing-page-cookie-button"
          >
            {accepted ? 'Accepted' : 'Accept cookies'}
          </button>
        </div>
      ) : null}

      {url ? (
        <a
          href={canOpenUrl ? url : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!canOpenUrl}
          className={`landing-page-url-button ${
            canOpenUrl
              ? ''
              : 'landing-page-url-button--disabled'
          }`}
        >
          {buttonText?.trim() || 'Open URL'}
        </a>
      ) : null}
    </div>
  );
}
