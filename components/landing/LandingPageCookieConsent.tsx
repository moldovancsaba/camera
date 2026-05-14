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
    <div>
      {enabled ? (
        <div className="landing-page-cookie-consent mt-4 space-y-4">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-white/20 p-4 backdrop-blur-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="landing-page-cookie-copy text-sm leading-6">
              I accept cookies for this landing page and want to continue.
            </span>
          </label>

          <button
            type="button"
            onClick={handleAccept}
            disabled={accepted || !checked}
            className="landing-page-cookie-button w-full rounded-xl px-5 py-4 text-base font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
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
          className={`landing-page-url-button mt-4 block w-full rounded-xl px-5 py-4 text-center text-base font-semibold transition-colors ${
            canOpenUrl
              ? ''
              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
          }`}
        >
          {buttonText?.trim() || 'Open URL'}
        </a>
      ) : null}
    </div>
  );
}
