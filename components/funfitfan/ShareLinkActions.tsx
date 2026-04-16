'use client';

import { useState } from 'react';
import { AppButton } from '@/components/ui/AppButton';

export default function ShareLinkActions({ shareUrl, title }: { shareUrl: string; title: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function copyLink() {
    setMessage(null);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage('Link copied — send it to friends.');
    } catch {
      setMessage('Could not copy. Copy the URL from the address bar when viewing the share page.');
    }
  }

  async function nativeShare() {
    setMessage(null);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: title, url: shareUrl });
        setMessage('Shared.');
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copyLink();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <AppButton type="button" variant="secondary" compact onClick={() => void nativeShare()}>
          Share…
        </AppButton>
        <AppButton type="button" variant="neutral" compact onClick={() => void copyLink()}>
          Copy link
        </AppButton>
      </div>
      {message ? <p className="text-sm text-emerald-400/90">{message}</p> : null}
      <p className="break-all text-xs text-slate-500">{shareUrl}</p>
    </div>
  );
}
