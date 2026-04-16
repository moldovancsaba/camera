'use client';

import { AppButton } from '@/components/ui/AppButton';

export default function HistoryPlayReelButton({ slideshowId }: { slideshowId: string | null }) {
  if (!slideshowId) {
    return (
      <p className="fff-app-footnote">
        Log a FunFitFan activity to create your reel — then you can watch it here.
      </p>
    );
  }
  return (
    <AppButton
      type="button"
      variant="primary"
      onClick={() => window.open(`/slideshow/${slideshowId}`, '_blank', 'noopener,noreferrer')}
    >
      Watch my reel
    </AppButton>
  );
}
