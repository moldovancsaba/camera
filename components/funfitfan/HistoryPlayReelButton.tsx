'use client';

import { AppButton } from '@/components/ui/AppButton';
import { openSlideshowInNewTab } from '@/lib/slideshow/open-slideshow';

export default function HistoryPlayReelButton({ slideshowId }: { slideshowId: string | null }) {
  if (!slideshowId) {
    return (
      <p className="fff-app-footnote">
        Log an activity or complete a gym selfie to build your reel — then you can watch it here.
      </p>
    );
  }
  return (
    <AppButton
      type="button"
      variant="primary"
      onClick={() => openSlideshowInNewTab(slideshowId)}
    >
      Watch my reel
    </AppButton>
  );
}
