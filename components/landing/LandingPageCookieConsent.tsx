'use client';

import { useMemo, useState } from 'react';

interface Props {
  slug: string;
  enabled: boolean;
  url: string | null;
}

function storageKey(slug: string): string {
  return `landing-cookie-consent:${slug}`;
}

export default function LandingPageCookieConsent({
  slug,
  enabled,
  url,
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        Cookies and actions
      </h2>

      {enabled ? (
        <div className="mt-4 space-y-4">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm leading-6 text-slate-700">
              I accept cookies for this landing page and want to continue.
            </span>
          </label>

          <button
            type="button"
            onClick={handleAccept}
            disabled={accepted || !checked}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {accepted ? 'Accepted' : 'Accept cookies'}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          Cookie acceptance is not required for this landing page.
        </p>
      )}

      {url ? (
        <a
          href={canOpenUrl ? url : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!canOpenUrl}
          className={`mt-4 block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold transition-colors ${
            canOpenUrl
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
          }`}
        >
          Open URL
        </a>
      ) : null}
    </div>
  );
}
