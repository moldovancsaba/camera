'use client';

/**
 * A tagged library picture of a partner or an event as a slot (issue 540 for the sample selfie, issue 326 for the stadium background): the same slot panel as the logo, at the level of the page it is
 * on. A partner follows the global pictures until it chooses or uploads its own; an event follows its partner. The panel only shows and asks; this component loads the slot, saves a choice (`PUT
 * .../<slotPath>`), uploads (`POST .../<slotPath>/upload`) and reloads. What a kind is called and where its routes are is in `components/admin/library/tagged-kinds.ts`.
 */

import { useCallback, useEffect, useState } from 'react';
import { GdsGrid, GdsStack, LabelTag, MediaPreviewCard, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import SlotPanel, { type SlotItem } from '@/components/admin/kit/SlotPanel';
import { TAGGED_KINDS, type TaggedKind } from '@/components/admin/library/tagged-kinds';
import ShareToChildrenToggle from '@/components/admin/library/ShareToChildrenToggle';
import LibraryUploadActiveToggle from '@/components/admin/library/LibraryUploadActiveToggle';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES, IMAGE_MAX_WORDS } from '@/lib/library/image-files';
import type { SlotMode, SlotValue } from '@/lib/slots/resolve';

interface Panel {
  value: SlotValue;
  mode: SlotMode;
  defaultItems: SlotItem[];
  effective: SlotItem[];
  candidates: SlotItem[];
  shareableItems?: ManagedSlotItem[];
  inactiveOwnItems?: ManagedSlotItem[];
  parentName: string | null;
}

type ManagedSlotItem = SlotItem & { itemActive: boolean; shareToChildren?: boolean };

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
    <>
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
    {level === 'partner' && (panel.shareableItems?.length ?? 0) > 0 ? (
      <SectionPanel title="Partner uploads shared with events" description="Partner-owned pictures stay local until you share each one. Turning sharing off removes it from child event choices; current event selections remain stored and can return if sharing is restored.">
        <GdsGrid columns="auto-fill" minColumnWidth="aside" gap="md">
          {panel.shareableItems?.map((item) => (
            <GdsStack key={item.id} gap="sm">
              <MediaPreviewCard title={item.name} src={item.imageUrl ?? undefined} thumbnailSrc={item.thumbnailUrl ?? undefined} alt={item.name} status={<LabelTag tone={item.shareToChildren === false ? 'neutral' : 'success'} label={item.shareToChildren === false ? 'Not shared' : 'Shared with events'} />} hideWhenNoMedia={false} />
              <LibraryUploadActiveToggle level="partner" ownerId={id} kind="images" id={item.id} itemActive={item.itemActive} shareToChildren={item.shareToChildren} disabled={busy} onSaved={reload} />
              <ShareToChildrenToggle kind="images" id={item.id} shareToChildren={item.shareToChildren} childAudience="events" disabled={busy || !item.itemActive} onSaved={reload} />
            </GdsStack>
          ))}
        </GdsGrid>
      </SectionPanel>
    ) : null}
    {level === 'event' && (panel.inactiveOwnItems?.length ?? 0) > 0 ? (
      <SectionPanel title="Event uploads switched off" description="These event-owned pictures are unavailable until you switch them on again.">
        <GdsGrid columns="auto-fill" minColumnWidth="aside" gap="md">
          {panel.inactiveOwnItems?.map((item) => (
            <GdsStack key={item.id} gap="sm">
              <MediaPreviewCard title={item.name} src={item.imageUrl ?? undefined} thumbnailSrc={item.thumbnailUrl ?? undefined} alt={item.name} status={<LabelTag tone="warning" label="Switched off" />} hideWhenNoMedia={false} />
              <LibraryUploadActiveToggle level="event" ownerId={id} kind="images" id={item.id} itemActive={false} disabled={busy} onSaved={reload} />
            </GdsStack>
          ))}
        </GdsGrid>
      </SectionPanel>
    ) : null}
    </>
  );
}
