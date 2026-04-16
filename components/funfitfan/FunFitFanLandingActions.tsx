'use client';

import Link from 'next/link';
import { AppButton } from '@/components/ui/AppButton';

export default function FunFitFanLandingActions({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="app-btn-stack app-btn-stack--fff-landing">
      {!signedIn ? (
        <Link href="/fff/login" prefetch={false} className="app-btn app-btn--secondary">
          Sign in/sign up
        </Link>
      ) : null}
      {signedIn ? (
        <>
          <Link href="/fff/log" prefetch={false} className="app-btn app-btn--primary">
            I DO IT
          </Link>
          <Link href="/fff/history" prefetch={false} className="app-btn app-btn--secondary">
            HISTORY
          </Link>
          <a href="/api/auth/logout" className="app-btn app-btn--neutral">
            Log out
          </a>
        </>
      ) : null}
    </div>
  );
}
