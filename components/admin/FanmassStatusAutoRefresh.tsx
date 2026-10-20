'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Keep Fanmass queue/result states fresh while an event's Analysed view is open. */
export default function FanmassStatusAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return <span className="sr-only" aria-live="polite">Fanmass photo status refreshes every 10 seconds while this page is open.</span>;
}
