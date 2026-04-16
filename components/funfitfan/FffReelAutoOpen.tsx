'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { openSlideshowInNewTab } from '@/lib/slideshow/open-slideshow';
import { AppButton } from '@/components/ui/AppButton';

export default function FffReelAutoOpen({ slideshowId }: { slideshowId: string }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const win = openSlideshowInNewTab(slideshowId);
    if (win) {
      router.replace('/fff');
    } else {
      setBlocked(true);
    }
  }, [slideshowId, router]);

  if (!blocked) {
    return (
      <div className="fff-app-inner fff-app-text-center">
        <p className="fff-app-muted">Opening your reel in a new tab…</p>
      </div>
    );
  }

  return (
    <div className="fff-app-inner fff-app-text-center">
      <p className="mb-4 fff-app-muted">Your browser blocked the new tab. Open the reel using the button below.</p>
      <div className="app-btn-stack app-btn-stack--wizard">
        <AppButton
          type="button"
          variant="primary"
          onClick={() => {
            openSlideshowInNewTab(slideshowId);
          }}
        >
          Open reel in new tab
        </AppButton>
        <AppButton type="button" variant="ghost" compact onClick={() => router.push('/fff')}>
          Home
        </AppButton>
      </div>
    </div>
  );
}
