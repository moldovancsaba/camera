'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppButton } from '@/components/ui/AppButton';
import type { GymSessionStepLogEntry } from '@/lib/gym/session-workout-path';

export default function GymSessionWorkoutFooter({
  sessionId,
  hasSelfie,
  initialStatus,
  initialStepLog,
}: {
  sessionId: string;
  hasSelfie: boolean;
  initialStatus: string;
  initialStepLog: GymSessionStepLogEntry[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  async function patchBody(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gym/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      const s = data.data?.session;
      if (s?.status) setStatus(s.status);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function completeWorkout() {
    await patchBody({ status: 'completed', stepLog: initialStepLog });
  }

  if (status !== 'in_progress') {
    return <p className="fff-app-muted">Session {status}.</p>;
  }

  return (
    <div className="gym-session-footer-block">
      {hasSelfie ? (
        <AppButton type="button" variant="primary" disabled={loading} onClick={() => void completeWorkout()}>
          {loading ? 'Saving…' : 'Complete workout'}
        </AppButton>
      ) : (
        <>
          <p className="fff-app-muted">
            Add your gym selfie, then tap <strong>Complete workout</strong> below.
          </p>
          <div className="gym-session-footer-actions">
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => router.push(`/workout/session/${sessionId}/selfie`)}
            >
              Take selfie
            </AppButton>
          </div>
        </>
      )}
      {error ? <p className="mt-2 text-sm fff-app-error">{error}</p> : null}
    </div>
  );
}
