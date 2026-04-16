'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

interface Step {
  order: number;
  title: string;
  detail?: string;
}

type StepLogEntry = { stepOrder: number; completedAt: string; notes?: string };

export default function SessionActions({
  sessionId,
  steps,
  initialStatus,
  initialStepLog,
}: {
  sessionId: string;
  steps: Step[];
  initialStatus: string;
  initialStepLog: StepLogEntry[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [stepLog, setStepLog] = useState<StepLogEntry[]>(initialStepLog);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedSteps = steps.slice().sort((a, b) => a.order - b.order);

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
      if (Array.isArray(s?.stepLog)) setStepLog(s.stepLog);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function markStepDone(order: number) {
    const nextLog: StepLogEntry[] = [
      ...stepLog.filter((p) => p.stepOrder !== order),
      { stepOrder: order, completedAt: new Date().toISOString() },
    ];
    setStepLog(nextLog);
    await patchBody({ stepLog: nextLog });
  }

  async function completeWorkout() {
    await patchBody({ status: 'completed', stepLog });
  }

  const completed = new Set(stepLog.map((l) => l.stepOrder));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Steps</h2>
        <ul className="mt-3 space-y-2">
          {sortedSteps.map((step) => (
            <li
              key={step.order}
              className="flex items-center justify-between rounded border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <span className="text-slate-800 dark:text-slate-200">{step.title}</span>
              {status === 'in_progress' ? (
                <button
                  type="button"
                  disabled={loading || completed.has(step.order)}
                  onClick={() => void markStepDone(step.order)}
                  className="text-sm font-medium text-blue-600 disabled:text-slate-400 dark:text-blue-400"
                >
                  {completed.has(step.order) ? 'Done' : 'Mark done'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {status === 'in_progress' ? (
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/gym/session/${sessionId}/selfie`}
            className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-gray-600 dark:text-slate-200 dark:hover:bg-gray-800"
          >
            Add gym selfie
          </Link>
          <button
            type="button"
            disabled={loading}
            onClick={() => void completeWorkout()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Complete workout'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">Session {status}.</p>
      )}

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
