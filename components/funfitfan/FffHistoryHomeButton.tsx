'use client';

import { useRouter } from 'next/navigation';
import { AppButton } from '@/components/ui/AppButton';

export default function FffHistoryHomeButton() {
  const router = useRouter();
  return (
    <div className="app-btn-stack app-btn-stack--fff-history-home">
      <AppButton type="button" variant="ghost" compact onClick={() => router.push('/fff')}>
        Home
      </AppButton>
    </div>
  );
}
