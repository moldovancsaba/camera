'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppButton } from '@/components/ui/AppButton';
import FeelSoHashtagInput from '@/components/funfitfan/FeelSoHashtagInput';
import { writeFffLogWorkoutDraft } from '@/lib/funfitfan/log-workout-draft';

type BootstrapCtx = {
  eventUuid: string;
  eventName: string;
  slideshowId: string;
  partnerId: string;
  partnerName: string;
  frame: {
    frameId: string;
    name: string;
    fileUrl: string;
    imageUrl?: string;
    width: number;
    height: number;
  };
};

export default function FunFitFanLogWizard() {
  const router = useRouter();
  const [step, setStep] = useState<'load' | 'details' | 'error'>('load');
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<BootstrapCtx | null>(null);
  const [activity, setActivity] = useState('');
  const [feelSoTags, setFeelSoTags] = useState<string[]>([]);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);
  const [lessonSports, setLessonSports] = useState<string[]>([]);
  const [lessonSportsError, setLessonSportsError] = useState<string | null>(null);

  const loadBootstrap = useCallback(async () => {
    setStep('load');
    setError(null);
    try {
      const res = await fetch('/api/fff/bootstrap');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Could not start (${res.status})`);
        setStep('error');
        return;
      }
      const d = json.data;
      const overlay =
        d?.frame?.fileUrl || (typeof d?.frame?.imageUrl === 'string' ? d.frame.imageUrl : '');
      if (!d?.frame?.frameId || !overlay) {
        setError(json.error || 'Could not load your FunFitFan frame. Ask an admin to set the default frame.');
        setStep('error');
        return;
      }
      setCtx({
        eventUuid: d.eventUuid,
        eventName: d.eventName,
        slideshowId: d.slideshowId,
        partnerId: d.partnerId,
        partnerName: d.partnerName,
        frame: {
          ...d.frame,
          fileUrl: overlay,
        },
      });
      setStep('details');
    } catch {
      setError('Network error');
      setStep('error');
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (step !== 'details') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/fff/hashtags');
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const list = json.data?.hashtags;
        if (Array.isArray(list)) {
          setHashtagSuggestions(list.filter((x: unknown): x is string => typeof x === 'string'));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    if (step !== 'details') return;
    let cancelled = false;
    (async () => {
      setLessonSportsError(null);
      try {
        const res = await fetch('/api/gym/lessons');
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) {
          if (!cancelled) {
            setLessonSports([]);
            setLessonSportsError(
              typeof json.error === 'string' ? json.error : 'Could not load sport lessons.'
            );
          }
          return;
        }
        const list = json.data?.lessons;
        if (!Array.isArray(list)) {
          setLessonSports([]);
          return;
        }
        const sports = [
          ...new Set(
            list
              .map((row: { sport?: string }) => (typeof row.sport === 'string' ? row.sport.trim() : ''))
              .filter((s: string) => s.length > 0)
          ),
        ].sort((a, b) => a.localeCompare(b));
        if (!cancelled) setLessonSports(sports);
      } catch {
        if (!cancelled) {
          setLessonSports([]);
          setLessonSportsError('Could not load sport lessons.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  function continueToLessons() {
    const act = activity.trim();
    if (!act || !lessonSports.includes(act)) {
      setError('Choose a sport that has at least one published lesson.');
      return;
    }
    setError(null);
    writeFffLogWorkoutDraft({ activity: act, feelSoTags });
    router.push(`/gym?sport=${encodeURIComponent(act)}`);
  }

  if (step === 'load') {
    return (
      <div className="fff-app-center-block">
        <div className="fff-app-spinner" aria-hidden />
        <p className="mt-4 fff-app-muted">Preparing your FunFitFan session…</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="py-12 text-center">
        <p className="fff-app-error">{error}</p>
        <div className="app-btn-stack app-btn-stack--wizard">
          <AppButton type="button" variant="primary" onClick={() => void loadBootstrap()}>
            Try again
          </AppButton>
          <AppButton type="button" variant="ghost" compact onClick={() => router.push('/fff')}>
            Back
          </AppButton>
        </div>
      </div>
    );
  }

  if (step === 'details' && ctx) {
    return (
      <div className="py-8">
        <h1 className="fff-app-page-title">What do you do?</h1>
        <label className="fff-field-label" htmlFor="fff-activity">
          Activity
        </label>
        <select
          id="fff-activity"
          className="fff-field-select"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
        >
          <option value="">— Choose an activity —</option>
          {lessonSports.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {lessonSportsError ? <p className="mt-2 text-sm fff-app-error">{lessonSportsError}</p> : null}
        {lessonSports.length === 0 && !lessonSportsError ? (
          <p className="mt-2 text-sm fff-app-muted">
            No published sport lessons yet. Add lessons under Admin → Sport before you can continue.
          </p>
        ) : null}
        <label className="fff-field-label" htmlFor="fff-feelso-input">
          Feel so
        </label>
        <FeelSoHashtagInput
          id="fff-feelso-input"
          value={feelSoTags}
          onChange={setFeelSoTags}
          suggestions={hashtagSuggestions}
        />
        {error ? <p className="mt-3 fff-app-error">{error}</p> : null}
        <div className="fff-log-details-actions">
          <AppButton type="button" variant="ghost" compact onClick={() => router.push('/fff')}>
            BACK
          </AppButton>
          <AppButton
            type="button"
            variant="primary"
            compact
            disabled={lessonSports.length === 0}
            onClick={() => continueToLessons()}
          >
            Continue
          </AppButton>
        </div>
      </div>
    );
  }

  return null;
}
