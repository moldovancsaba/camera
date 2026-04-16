'use client';

import Link from 'next/link';

export default function ReelEmptyCTA() {
  return (
    <div className="app-btn-stack app-btn-stack--fff-reel-empty">
      <Link href="/fff/log" prefetch={false} className="app-btn app-btn--primary">
        I DO IT
      </Link>
      <Link href="/fff/history" prefetch={false} className="app-btn app-btn--secondary">
        History
      </Link>
    </div>
  );
}
