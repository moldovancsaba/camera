'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppButton } from '@/components/ui/AppButton';
import {
  GYM_STEP_SKIP_NOTE,
  nextGymStepPath,
  type GymLessonStepLite,
  type GymSessionStepLogEntry,
} from '@/lib/gym/session-workout-path';

export default function GymSessionStepPanel({
  sessionId,
  sortedSteps,
  ordinal,
  step,
  stepLog: initialStepLog,
  hasSelfie,
  status,
}: {
  sessionId: string;
  sortedSteps: GymLessonStepLite[];
  ordinal: number;
  step: GymLessonStepLite;
  stepLog: GymSessionStepLogEntry[];
  hasSelfie: boolean;
  status: string;
}) {
  const router = useRouter();
  const [stepLog, setStepLog] = useState(initialStepLog);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visited = new Set(stepLog.map((e) => e.stepOrder));
  const alreadyHandled = visited.has(step.order);
  const total = sortedSteps.length;
  const stepLabel = `Step ${ordinal + 1} of ${total}`;

  async function patchStepLog(nextLog: GymSessionStepLogEntry[]) {
    setLoading(true);
    setError(null);
    let leaveForNextRoute = false;
    try {
      const res = await fetch(`/api/gym/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepLog: nextLog }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      const s = data.data?.session;
      const nextStatus = typeof s?.status === 'string' ? s.status : status;
      // Do not merge server stepLog into state here: that marks this step "handled" and
      // briefly shows the Continue UI before `router.push` runs. Go straight to the next screen.
      leaveForNextRoute = true;
      router.push(
        nextGymStepPath({
          sessionId,
          sortedSteps,
          ordinal,
          hasSelfie,
          status: nextStatus,
        })
      );
    } catch {
      setError('Network error');
    } finally {
      if (!leaveForNextRoute) {
        setLoading(false);
      }
    }
  }

  function mergeLog(order: number, notes?: string) {
    const next: GymSessionStepLogEntry[] = [
      ...stepLog.filter((p) => p.stepOrder !== order),
      { stepOrder: order, completedAt: new Date().toISOString(), ...(notes ? { notes } : {}) },
    ];
    return next;
  }

  async function onMarkDone() {
    await patchStepLog(mergeLog(step.order));
  }

  async function onSkip() {
    await patchStepLog(mergeLog(step.order, GYM_STEP_SKIP_NOTE));
  }

  async function onContinueOnly() {
    router.push(
      nextGymStepPath({
        sessionId,
        sortedSteps,
        ordinal,
        hasSelfie,
        status,
      })
    );
    router.refresh();
  }

  return (
    <div className="gym-step-page">
      <p className="gym-step-kicker">{stepLabel}</p>
      <h1 className="gym-step-title">{step.title}</h1>
      {step.detail ? <p className="gym-step-detail">{step.detail}</p> : null}

      {error ? <p className="gym-step-error text-sm fff-app-error">{error}</p> : null}

      {alreadyHandled ? (
        <div className="gym-step-handled">
          <p className="gym-step-handled-msg">
            {stepLog.find((e) => e.stepOrder === step.order)?.notes === GYM_STEP_SKIP_NOTE
              ? 'You skipped this step.'
              : 'You already completed this step.'}
          </p>
          <AppButton type="button" variant="primary" onClick={() => void onContinueOnly()}>
            Continue
          </AppButton>
        </div>
      ) : status === 'in_progress' ? (
        <div className="gym-step-dual-actions">
          <AppButton type="button" variant="ghost" disabled={loading} onClick={() => void onSkip()}>
            Skip
          </AppButton>
          <AppButton type="button" variant="primary" disabled={loading} onClick={() => void onMarkDone()}>
            {loading ? 'Saving…' : 'Mark done'}
          </AppButton>
        </div>
      ) : (
        <p className="fff-app-muted">This workout is {status}.</p>
      )}
    </div>
  );
}
