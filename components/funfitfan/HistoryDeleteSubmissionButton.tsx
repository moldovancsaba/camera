'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
    <div className="fff-history-delete-actions">
      <button type="button" onClick={() => void onDelete()} disabled={busy} className="fff-btn-danger-ghost">
        {busy ? '…' : 'Delete'}
      </button>
      {error ? <p className="fff-history-delete-error">{error}</p> : null}
    </div>
  );
}
