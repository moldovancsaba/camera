'use client';

import { useRouter } from 'next/navigation';
import { AppButton } from '@/components/ui/AppButton';

export default function ReelEmptyCTA() {
  const router = useRouter();
  return (
    <div className="app-btn-stack app-btn-stack--fff-reel-empty">
      <AppButton type="button" variant="primary" onClick={() => router.push('/fff/log')}>
        I DID IT
      </AppButton>
      <AppButton type="button" variant="secondary" onClick={() => router.push('/fff/history')}>
        History
      </AppButton>
    </div>
  );
}
