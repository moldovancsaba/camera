'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppButton } from '@/components/ui/AppButton';
import { readFffLogWorkoutDraft } from '@/lib/funfitfan/log-workout-draft';
import { gymLessonsListHref } from '@/lib/gym/gym-lessons-href';

function GymHeaderBarInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function lessonsHref() {
    const urlSport = searchParams.get('sport');
    if (typeof urlSport === 'string' && urlSport.trim()) {
      return gymLessonsListHref(urlSport);
    }
    const draft = readFffLogWorkoutDraft();
    return gymLessonsListHref(draft?.activity ?? null);
  }

  const href = lessonsHref();

  return (
    <header className="fff-gym-header-shell">
      <div className="fff-gym-header-inner">
        <AppButton
          type="button"
          variant="ghost"
          className="fff-gym-header-brand"
          onClick={() => router.push(href)}
        >
          Gym
        </AppButton>
        <nav className="fff-gym-header-nav" aria-label="Gym navigation">
          <AppButton type="button" variant="secondary" compact onClick={() => router.push(href)}>
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

function GymHeaderBarFallback() {
  return (
    <header className="fff-gym-header-shell" aria-hidden>
      <div className="fff-gym-header-inner min-h-[2.75rem]" />
    </header>
  );
}

export default function GymHeaderBar() {
  return (
    <Suspense fallback={<GymHeaderBarFallback />}>
      <GymHeaderBarInner />
    </Suspense>
  );
}
