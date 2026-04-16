'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppButton } from '@/components/ui/AppButton';

export default function StartWorkoutButton({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gym/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      const sess = data.data?.session as { sessionId?: string; lessonSteps?: unknown[] } | undefined;
      const sessionId = sess?.sessionId;
      if (sessionId) {
        const steps = Array.isArray(sess?.lessonSteps) ? sess.lessonSteps : [];
        router.push(
          steps.length > 0
            ? `/workout/session/${sessionId}/step/0`
            : `/workout/session/${sessionId}`
        );
        router.refresh();
      } else {
        setError('Unexpected response');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AppButton type="button" variant="primary" disabled={loading} onClick={() => void start()}>
        {loading ? 'Starting…' : 'Start workout'}
      </AppButton>
      {error ? <p className="mt-2 text-sm fff-app-error">{error}</p> : null}
    </div>
  );
}
