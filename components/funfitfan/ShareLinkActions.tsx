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
        await navigator.share({
        title,
        text: `${title} ${shareUrl}`,
        url: shareUrl,
      });
        setMessage('Shared.');
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copyLink();
  }

  return (
    <div className="fff-share-actions">
      <div className="fff-share-actions-row">
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="app-btn app-btn--primary app-btn--compact"
        >
          View share page
        </a>
        <AppButton type="button" variant="secondary" compact onClick={() => void nativeShare()}>
          Share…
        </AppButton>
        <AppButton type="button" variant="neutral" compact onClick={() => void copyLink()}>
          Copy link
        </AppButton>
      </div>
      {message ? <p className="text-sm fff-share-actions-msg">{message}</p> : null}
      <p className="fff-share-url">{shareUrl}</p>
    </div>
  );
}
