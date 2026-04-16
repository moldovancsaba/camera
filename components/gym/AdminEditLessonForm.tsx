'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AdminDeleteLessonButton from '@/components/gym/AdminDeleteLessonButton';

type AdminEditLessonFormProps = {
  lessonId: string;
  initialTitle: string;
  initialDescription: string;
  initialStepsJson: string;
  initialIsPublished: boolean;
};

export default function AdminEditLessonForm({
  lessonId,
  initialTitle,
  initialDescription,
  initialStepsJson,
  initialIsPublished,
}: AdminEditLessonFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [stepsJson, setStepsJson] = useState(initialStepsJson);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    let steps: unknown;
    try {
      steps = JSON.parse(stepsJson);
    } catch {
      setError('Steps must be valid JSON');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/gym/lessons/${encodeURIComponent(lessonId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, steps, isPublished }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : `Failed (${res.status})`);
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
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          rows={10}
          value={stepsJson}
          onChange={(e) => setStepsJson(e.target.value)}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        Published (visible on /gym)
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save changes'}
        </button>
        <AdminDeleteLessonButton
          lessonId={lessonId}
          title={title.trim() || lessonId}
          redirectAfterDelete="/admin/gym/lessons"
        />
      </div>
    </form>
  );
}
