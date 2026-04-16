'use client';

import { useRouter } from 'next/navigation';
import { AppButton } from '@/components/ui/AppButton';

export default function FffLoginBackButton() {
  const router = useRouter();
  return (
    <div className="app-btn-stack app-btn-stack--fff-login-back">
      <AppButton type="button" variant="ghost" compact onClick={() => router.push('/')}>
        ← Back to FunFitFan home
      </AppButton>
    </div>
  );
}
