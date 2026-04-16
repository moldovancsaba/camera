'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type AdminDeleteLessonButtonProps = {
  lessonId: string;
  title: string;
  /** If set, navigate here after successful delete; otherwise `router.refresh()` only */
  redirectAfterDelete?: string;
};

export default function AdminDeleteLessonButton({
  lessonId,
  title,
  redirectAfterDelete,
}: AdminDeleteLessonButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Delete lesson “${title}”? This cannot be undone.`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/gym/lessons/${encodeURIComponent(lessonId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(typeof data.error === 'string' ? data.error : `Delete failed (${res.status})`);
        return;
      }
      if (redirectAfterDelete) {
        router.push(redirectAfterDelete);
      } else {
        router.refresh();
      }
    } catch {
      window.alert('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={loading}
      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-950/40"
    >
      {loading ? 'Deleting…' : 'Delete'}
    </button>
  );
}
