'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MAX_SPORT_ACTIVITIES } from '@/lib/funfitfan/sport-activities';
import { AppButton } from '@/components/ui/AppButton';

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
      .slice(0, MAX_SPORT_ACTIVITIES);
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
      const n = saved.length;
      setMessage(
        n >= MAX_SPORT_ACTIVITIES
          ? `Saved ${n} activities (list trimmed to ${MAX_SPORT_ACTIVITIES} unique entries).`
          : `Saved ${n} activit${n === 1 ? 'y' : 'ies'}.`
      );
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
        <label className="app-form-label" htmlFor="fff-activities">
          Sport activities (dropdown in member log)
        </label>
        <p className="app-form-hint">
          One per line. Shown in order in the FunFitFan log wizard. Duplicate lines (ignoring case) are removed when
          you save. Very long lists are capped at {MAX_SPORT_ACTIVITIES.toLocaleString()} unique entries.
        </p>
        <textarea
          id="fff-activities"
          rows={12}
          className="app-form-control app-form-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {message ? <p className="app-form-status">{message}</p> : null}
      <AppButton type="submit" variant="primary" compact disabled={loading}>
        {loading ? 'Saving…' : 'Save activities'}
      </AppButton>
    </form>
  );
}
