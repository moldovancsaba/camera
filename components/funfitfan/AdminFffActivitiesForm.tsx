'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const MAX = 20;

export default function AdminFffActivitiesForm({ initialLines }: { initialLines: string[] }) {
  const router = useRouter();
  const [text, setText] = useState(initialLines.join('\n'));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const sportActivities = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX);
    if (sportActivities.length === 0) {
      setMessage('Add at least one activity (one per line).');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/admin/gym/funfitfan/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sportActivities }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || `Failed (${res.status})`);
        return;
      }
      const saved: string[] = data.data?.sportActivities ?? sportActivities;
      setText(saved.join('\n'));
      setMessage(`Saved (${saved.length} activities, max ${MAX}).`);
      router.refresh();
    } catch {
      setMessage('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="fff-activities">
          Sport activities (dropdown in member log)
        </label>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          One per line, up to {MAX} entries. Shown in order in the FunFitFan log wizard.
        </p>
        <textarea
          id="fff-activities"
          rows={12}
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {message ? <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save activities'}
      </button>
    </form>
  );
}
