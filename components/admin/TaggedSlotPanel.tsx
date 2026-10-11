'use client';

/**
 * A tagged library picture of a partner or an event as a slot (issue 540 for the sample selfie, issue 326 for the stadium background): the same slot panel as the logo, at the level of the page it is
 * on. A partner follows the global pictures until it chooses or uploads its own; an event follows its partner. The panel only shows and asks; this component loads the slot, saves a choice (`PUT
 * .../<slotPath>`), uploads (`POST .../<slotPath>/upload`) and reloads. What a kind is called and where its routes are is in `components/admin/library/tagged-kinds.ts`.
 */

import { useCallback, useEffect, useState } from 'react';
import { StateBlock } from '@sovereignsquad/gds-core/client';
import SlotPanel, { type SlotItem } from '@/components/admin/kit/SlotPanel';
import { TAGGED_KINDS, type TaggedKind } from '@/components/admin/library/tagged-kinds';
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

export default function TaggedSlotPanel({ kind, level, id, onChanged }: { kind: TaggedKind; level: 'partner' | 'event'; id: string; onChanged?: () => void | Promise<void> }) {
  const info = TAGGED_KINDS[kind];
  const base = `/api/${level === 'partner' ? 'partners' : 'events'}/${id}/${info.slotPath}`;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setPanel(await call<Panel>(base));
  }, [base]);

  useEffect(() => {
    reload().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : `The ${info.plural} could not be loaded`));
  }, [reload, info.plural]);

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

  if (!panel) return error ? <StateBlock variant="error" title={`The ${info.plural} could not be loaded`} description={error} /> : <StateBlock variant="loading" title={`Loading the ${info.plural}...`} />;

  return (
    <SlotPanel
      title={info.title}
      description={info.panelDescription[level]}
      noun={info.noun}
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
