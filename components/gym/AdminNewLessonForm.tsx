'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminNewLessonForm({ sportOptions }: { sportOptions: string[] }) {
  const router = useRouter();
  const [sport, setSport] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsJson, setStepsJson] = useState(
    '[{"title":"Warm-up","detail":"5 minutes light cardio"},{"title":"Main block"},{"title":"Cool-down"}]'
  );
  const [isPublished, setIsPublished] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!sport.trim()) {
      setError('Select a sport from the list.');
      setLoading(false);
      return;
    }
    let steps: unknown;
    try {
      steps = JSON.parse(stepsJson);
    } catch {
      setError('Steps must be valid JSON');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/gym/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, steps, isPublished, sport }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      router.push('/admin/gym/lessons');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sport</label>
        <select
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          required
        >
          <option value="">— Select sport —</option>
          {sportOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {sportOptions.length === 0 ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            No sports configured. Add activities under Admin → Sport → FunFitFan settings first.
          </p>
        ) : null}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
        <input
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
        <textarea
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Steps (JSON)</label>
        <textarea
          className="mt-1 w-full font-mono text-sm rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          rows={8}
          value={stepsJson}
          onChange={(e) => setStepsJson(e.target.value)}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        Published (visible on /workout)
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading || sportOptions.length === 0}
        className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Create lesson'}
      </button>
    </form>
  );
}
