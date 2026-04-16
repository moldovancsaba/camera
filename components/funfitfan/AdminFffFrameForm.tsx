'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminFffFrameForm({
  frames,
  currentFrameId,
}: {
  frames: { frameId: string; name: string }[];
  currentFrameId: string;
}) {
  const router = useRouter();
  const [frameId, setFrameId] = useState(currentFrameId);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/gym/funfitfan/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultFrameId: frameId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || `Failed (${res.status})`);
        return;
      }
      setMessage('Saved. New FunFitFan sessions use this frame; existing member events inherit when not overridden.');
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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Default frame</label>
        <select
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          value={frameId}
          onChange={(e) => setFrameId(e.target.value)}
          required
        >
          <option value="">— Select —</option>
          {frames.map((f) => (
            <option key={f.frameId} value={f.frameId}>
              {f.name} ({f.frameId.slice(0, 8)}…)
            </option>
          ))}
        </select>
      </div>
      {message ? <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p> : null}
      <button
        type="submit"
        disabled={loading || !frameId}
        className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
