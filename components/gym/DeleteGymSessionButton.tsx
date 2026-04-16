'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteGymSessionButton({
  sessionId,
  lessonTitle,
}: {
  sessionId: string;
  lessonTitle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setError(null);
    const ok = window.confirm(
      `Delete workout "${lessonTitle}"? This removes the log from your account; the selfie file on hosting is not deleted.`
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/gym/sessions/${sessionId}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || `Delete failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1 pr-2">
      <button
        type="button"
        onClick={() => void onDelete()}
        disabled={busy}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/80 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      {error ? <p className="max-w-[10rem] text-right text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
