'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppButton } from '@/components/ui/AppButton';

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
    <form onSubmit={save} className="app-form-stack">
      <div>
        <label className="app-form-label" htmlFor="fff-default-frame">
          Default frame
        </label>
        <select
          id="fff-default-frame"
          className="app-form-control"
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
      {message ? <p className="app-form-status">{message}</p> : null}
      <AppButton type="submit" variant="primary" compact disabled={loading || !frameId}>
        {loading ? 'Saving…' : 'Save'}
      </AppButton>
    </form>
  );
}
