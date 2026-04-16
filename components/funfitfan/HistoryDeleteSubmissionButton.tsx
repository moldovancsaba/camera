'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const btnClass =
  'rounded-md border border-red-900/60 px-2.5 py-1 text-xs font-medium text-red-300 transition hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-50';

export default function HistoryDeleteSubmissionButton({
  submissionId,
  label,
  redirectAfterDelete,
}: {
  submissionId: string;
  /** Shown in confirm dialog */
  label: string;
  /** If set, navigate here after successful delete; otherwise `router.refresh()` */
  redirectAfterDelete?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setError(null);
    const ok = window.confirm(
      `Remove this moment from your history?\n\n"${label.slice(0, 80)}${label.length > 80 ? '…' : ''}"\n\nThe image file on hosting is not deleted.`
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || `Delete failed (${res.status})`);
        return;
      }
      if (redirectAfterDelete) {
        router.push(redirectAfterDelete);
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1">
      <button type="button" onClick={() => void onDelete()} disabled={busy} className={btnClass}>
        {busy ? '…' : 'Delete'}
      </button>
      {error ? <p className="max-w-[6rem] text-center text-[10px] text-red-400">{error}</p> : null}
    </div>
  );
}
