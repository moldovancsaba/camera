'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { openSlideshowInNewTab } from '@/lib/slideshow/open-slideshow';
import { AppButton } from '@/components/ui/AppButton';

export default function FffReelAutoOpen({ slideshowId }: { slideshowId: string }) {
  const router = useRouter();

  useEffect(() => {
    const win = openSlideshowInNewTab(slideshowId);
    if (win) {
      router.replace('/');
    }
  }, [slideshowId, router]);

  return (
    <div className="fff-app-inner fff-app-text-center">
      <p className="mb-4 fff-app-muted">
        Opening your reel in a new tab… if your browser blocks it, use the button below.
      </p>
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
        <AppButton type="button" variant="ghost" compact onClick={() => router.push('/')}>
          Home
        </AppButton>
      </div>
    </div>
  );
}
