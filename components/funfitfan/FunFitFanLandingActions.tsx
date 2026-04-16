'use client';

import { useRouter } from 'next/navigation';
import { AppButton } from '@/components/ui/AppButton';

export default function FunFitFanLandingActions({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();

  return (
    <div className="app-btn-stack app-btn-stack--fff-landing">
      {!signedIn ? (
        <AppButton variant="secondary" onClick={() => router.push('/fff/login')}>
          Sign in/sign up
        </AppButton>
      ) : null}
      {signedIn ? (
        <>
          <AppButton variant="primary" onClick={() => router.push('/fff/log')}>
            I DO IT
          </AppButton>
          <AppButton variant="secondary" onClick={() => router.push('/fff/history')}>
            HISTORY
          </AppButton>
          <a href="/api/auth/logout" className="app-btn app-btn--neutral">
            Log out
          </a>
        </>
      ) : null}
    </div>
  );
}
