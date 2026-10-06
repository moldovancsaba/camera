'use client';

/**
 * Re-reads the page every so often while it is visible, so the "waiting for approval" page turns into the photo by itself once it
 * is approved (camera#269).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoRefresh({ everyMs = 20000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
