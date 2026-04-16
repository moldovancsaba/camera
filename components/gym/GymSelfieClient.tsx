'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import FunFitFanCheckinSelfieReelFlow, {
  type CheckinBootstrapCtx,
} from '@/components/funfitfan/FunFitFanCheckinSelfieReelFlow';
import { AppButton } from '@/components/ui/AppButton';
import { readFffLogWorkoutDraft, clearFffLogWorkoutDraft } from '@/lib/funfitfan/log-workout-draft';
import { gymLessonsListHref } from '@/lib/gym/gym-lessons-href';

export default function GymSelfieClient({
  sessionId,
  fallbackActivity,
}: {
  sessionId: string;
  /** From lesson document when sessionStorage draft is missing. */
  fallbackActivity: string;
}) {
  const router = useRouter();
  const [ctx, setCtx] = useState<CheckinBootstrapCtx | null>(null);
  const [activity, setActivity] = useState('');
  const [feelSoTags, setFeelSoTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadBootstrap = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/fff/bootstrap');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Could not start (${res.status})`);
        return;
      }
      const d = json.data;
      const overlay =
        d?.frame?.fileUrl || (typeof d?.frame?.imageUrl === 'string' ? d.frame.imageUrl : '');
      if (!d?.frame?.frameId || !overlay) {
        setError('Could not load your FunFitFan frame. Ask an admin to set the default frame.');
        return;
      }
      setCtx({
        eventUuid: d.eventUuid,
        eventName: d.eventName,
        slideshowId: d.slideshowId,
        frame: {
          ...d.frame,
          fileUrl: overlay,
        },
      });
    } catch {
      setError('Network error');
    }
  }, []);

  useEffect(() => {
    const draft = readFffLogWorkoutDraft();
    if (draft) {
      setActivity(draft.activity);
      setFeelSoTags(draft.feelSoTags);
    } else if (fallbackActivity.trim()) {
      setActivity(fallbackActivity.trim());
      setFeelSoTags([]);
    }
    void loadBootstrap();
  }, [fallbackActivity, loadBootstrap]);

  async function onAfterSubmissionSaved(imageUrl: string) {
    const res = await fetch(`/api/gym/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', selfieImageUrl: imageUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === 'string'
          ? data.error
          : `Workout could not be marked complete (${res.status}). Your reel card was saved.`
      );
    }
    clearFffLogWorkoutDraft();
  }

  if (error && !ctx) {
    return (
      <div className="py-12 text-center">
        <p className="fff-app-error">{error}</p>
        <div className="app-btn-stack app-btn-stack--wizard mt-6">
          <AppButton type="button" variant="primary" onClick={() => void loadBootstrap()}>
            Try again
          </AppButton>
        </div>
      </div>
    );
  }

  if (!ctx || !activity.trim()) {
    return (
      <div className="py-12 text-center">
        <p className="fff-app-muted">
          {!activity.trim()
            ? 'Start from I DO IT: choose your sport and hashtags, then Continue to your lesson.'
            : 'Preparing check-in…'}
        </p>
      </div>
    );
  }

  return (
    <FunFitFanCheckinSelfieReelFlow
      ctx={ctx}
      activity={activity}
      feelSoTags={feelSoTags}
      onCancel={() => router.push(gymLessonsListHref(activity.trim() || null))}
      onAfterSubmissionSaved={onAfterSubmissionSaved}
    />
  );
}
