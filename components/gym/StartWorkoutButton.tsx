'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
      const sessionId = data.data?.session?.sessionId;
      if (sessionId) {
        router.push(`/gym/session/${sessionId}`);
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
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Starting…' : 'Start workout'}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
