'use client';

/** Loads and saves the wordings of one level (the Dictionary, a partner, an event) from its route, for the page of that level (issue 353). */

import { useCallback, useEffect, useState } from 'react';
import type { TextsByLanguage } from '@/lib/i18n/overrides';

interface Payload<T> {
  data?: T;
  error?: string;
}

export function useTextLevel<T extends { texts: TextsByLanguage }>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(url);
        const payload = (await response.json().catch(() => null)) as Payload<T> | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
        if (!cancelled) setData(payload.data);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'The texts could not be loaded');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const save = useCallback(
    async (texts: TextsByLanguage) => {
      if (!url) return;
      setSaving(true);
      setSaveError(null);
      setSaved(false);
      try {
        const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts }) });
        const payload = (await response.json().catch(() => null)) as Payload<{ texts: TextsByLanguage }> | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
        setData((current) => (current ? { ...current, texts: payload.data!.texts } : current));
        setSaved(true);
      } catch (failure) {
        setSaveError(failure instanceof Error ? failure.message : 'The texts could not be saved');
      } finally {
        setSaving(false);
      }
    },
    [url]
  );

  return { data, loading, error, saveError, saving, saved, save };
}
