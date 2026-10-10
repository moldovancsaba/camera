'use client';

/**
 * The sample selfies of a partner or an event (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): the same slot panel as the logo, at the level of the page it is on. A partner follows the global
 * sample selfies until it chooses or uploads its own; an event follows its partner; one of what is used is picked for the welcome page screen. The panel only shows and asks; this
 * component loads the slot, saves a choice (`PUT .../selfie-slot`), uploads (`POST .../selfie-slot/upload`) and reloads.
 */

import { useCallback, useEffect, useState } from 'react';
import { StateBlock } from '@sovereignsquad/gds-core/client';
import SlotPanel, { type SlotItem } from '@/components/admin/kit/SlotPanel';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES, IMAGE_MAX_WORDS } from '@/lib/library/image-files';
import type { SlotMode, SlotValue } from '@/lib/slots/resolve';

interface Panel {
  value: SlotValue;
  mode: SlotMode;
  defaultItems: SlotItem[];
  effective: SlotItem[];
  candidates: SlotItem[];
  parentName: string | null;
}

interface Payload<T> {
  data?: T;
  error?: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data;
}

export default function SampleSelfiePanel({ level, id, onChanged }: { level: 'partner' | 'event'; id: string; onChanged?: () => void | Promise<void> }) {
  const base = `/api/${level === 'partner' ? 'partners' : 'events'}/${id}/selfie-slot`;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setPanel(await call<Panel>(base));
  }, [base]);

  useEffect(() => {
    reload().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'The sample selfies could not be loaded'));
  }, [reload]);

  const save = async (value: SlotValue) => {
    setBusy(true);
    setError(null);
    try {
      setPanel(await call<Panel>(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) }));
      await onChanged?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  if (!panel) return error ? <StateBlock variant="error" title="The sample selfies could not be loaded" description={error} /> : <StateBlock variant="loading" title="Loading the sample selfies..." />;

  return (
    <SlotPanel
      title="Sample selfies"
      description={
        level === 'partner'
          ? 'The picture in the photo window of the welcome page screen when an event has no photo of its own to show. Until you choose or upload your own, your events use the general sample selfies.'
          : 'The picture in the photo window of the welcome page screen. Until you choose or upload your own, this event uses its partner’s sample selfies. One of them is picked for the screen.'
      }
      noun="sample selfie"
      parentName={panel.parentName}
      value={panel.value}
      mode={panel.mode}
      defaultItems={panel.defaultItems}
      effective={panel.effective}
      candidates={panel.candidates}
      busy={busy}
      error={error}
      onChange={save}
      upload={{ endpoint: `${base}/upload`, extraFields: {}, accept: IMAGE_FILE_TYPES.join(','), acceptWords: IMAGE_FILE_WORDS, maxBytes: IMAGE_MAX_BYTES, maxWords: IMAGE_MAX_WORDS, kind: 'images' }}
      onUploaded={async () => {
        await reload();
        await onChanged?.();
      }}
    />
  );
}
