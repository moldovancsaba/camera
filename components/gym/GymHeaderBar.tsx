'use client';

import { useRouter } from 'next/navigation';
import { AppButton } from '@/components/ui/AppButton';

export default function GymHeaderBar() {
  const router = useRouter();

  return (
    <header className="gym-header-shell">
      <div className="gym-header-inner">
        <AppButton
          type="button"
          variant="ghost"
          className="gym-header-brand"
          onClick={() => router.push('/gym')}
        >
          Gym
        </AppButton>
        <nav className="gym-header-nav" aria-label="Gym navigation">
          <AppButton type="button" variant="secondary" compact onClick={() => router.push('/gym')}>
            Lessons
          </AppButton>
          <AppButton type="button" variant="secondary" compact onClick={() => router.push('/')}>
            Home
          </AppButton>
        </nav>
      </div>
    </header>
  );
}
