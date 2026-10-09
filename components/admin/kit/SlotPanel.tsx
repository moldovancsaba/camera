'use client';

/**
 * The panel of a slot (camera#418, docs/BUILDING_BRICKS.md): one component for every element a level chooses, at every level and every place of use, the
 * logo first. The owner's model (2026-10-09): every place uses the default by default, and the editor chooses there:
 * use the default, pick one from the parent's library, upload a new one, replace the default, add more, or show nothing. One item is used as it is,
 * several are picked at random. The panel only shows and asks; the page saves (`onChange`) and reloads. Built on GDS parts, no style props of its own.
 */

import { useState } from 'react';
import { GdsGrid, GdsInline, GdsStack, InlineAlert, LabelTag, MediaPreviewCard, MetadataText, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import { AdminCheckbox, AdminSelect } from '@sovereignsquad/gds-admin/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import type { SlotMode, SlotValue } from '@/lib/slots/resolve';

export interface SlotItem {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  /** `messmass` for a logo imported from messmass. */
  source?: string;
  /** The level that holds it in the chain (`partner`, `event`, `place`, `own`). */
  level?: string;
  /** The library no longer has it: what is shown is the level's snapshot of it (the fail-safe, issue 421). */
  lost?: boolean;
}

export interface SlotPanelProps {
  title: string;
  description?: string;
  /** What the item is: "logo". */
  noun: string;
  /** The level above that gives the default, in words ("the partner", "the event"); null at the top, where there is no default. */
  parentName: string | null;
  value: SlotValue;
  mode: SlotMode;
  /** What the level above gives, shown when the default is used. */
  defaultItems: SlotItem[];
  /** What is used here now. */
  effective: SlotItem[];
  /** What the editor can pick. */
  candidates: SlotItem[];
  busy?: boolean;
  error?: string | null;
  /** Saves the new value of the slot; the page reloads afterwards. */
  onChange: (value: SlotValue) => Promise<void> | void;
  /** The upload route of this level and the extra fields it needs (the slot to join): when absent the upload is not offered. */
  upload?: { endpoint: string; extraFields: Record<string, string>; accept: string; acceptWords: string; maxBytes?: number; maxWords?: string };
  /** Called after an upload so the page can reload. */
  onUploaded?: () => void | Promise<void>;
  /** Makes a lost item this level's own ("Keep as own"); when absent a lost item can only be removed. */
  onKeepLost?: (id: string) => Promise<void> | void;
}

const MODE_LABEL: Record<SlotMode, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
  default: { label: 'Using the default', tone: 'neutral' },
  add: { label: 'Own, and the default', tone: 'info' },
  replace: { label: 'Own, the default replaced', tone: 'success' },
  none: { label: 'Nothing shown', tone: 'warning' },
};

const initialOf = (value: SlotValue) => ({ items: [...(value.items ?? [])], useDefault: value.useDefault !== false });

export default function SlotPanel({ title, description, noun, parentName, value, mode, defaultItems, effective, candidates, busy, error, onChange, upload, onUploaded, onKeepLost }: SlotPanelProps) {
  const [pick, setPick] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const own = initialOf(value);
  const ownIds = new Set(own.items);
  const pickable = candidates.filter((item) => !ownIds.has(item.id));
  const defaultLabel = parentName ? `Default (from ${parentName})` : 'Default';
  // Above the events there is no default to use or replace: the state is only whether something is chosen.
  const topLevel = parentName ? MODE_LABEL[mode] : effective.length > 0 ? { label: 'Chosen', tone: 'success' as const } : { label: 'Nothing chosen', tone: 'warning' as const };

  const save = (items: string[], useDefault: boolean) => onChange({ ...(items.length > 0 ? { items } : {}), ...(useDefault ? {} : { useDefault: false }) });
  const add = (id: string) => save([...own.items, id], own.useDefault);
  const remove = (id: string) => save(own.items.filter((item) => item !== id), own.useDefault);

  const lostItems = effective.filter((item) => item.lost);
  const lostOwn = lostItems.filter((item) => ownIds.has(item.id));
  const lostInherited = lostItems.filter((item) => !ownIds.has(item.id));

  const levelTag = (item: SlotItem) => {
    if (item.lost) return <LabelTag tone="warning" label="No longer in the library" />;
    if (item.source === 'messmass') return <LabelTag tone="info" label="From messmass" />;
    return item.level === 'own' || ownIds.has(item.id) ? <LabelTag tone="success" label="Own" /> : <LabelTag tone="neutral" label={defaultLabel} />;
  };

  return (
    <SectionPanel title={title} description={description} action={<LabelTag tone={topLevel.tone} label={topLevel.label} />}>
      <GdsStack gap="md">
        {error ? <InlineAlert title="That did not work" message={error} severity="error" /> : null}
        {lostOwn.length > 0 ? (
          <InlineAlert
            title={`A ${noun} was lost at the library`}
            message={`The library no longer has ${lostOwn.map((item) => `"${item.name}"`).join(', ')}. This event keeps showing it, from what it saved. Keep it as this event's own ${noun}, or remove it.`}
            severity="warning"
          />
        ) : null}
        {lostInherited.length > 0 ? (
          <InlineAlert
            title={`A ${noun} was lost at the library`}
            message={`${parentName ? `${parentName[0].toUpperCase()}${parentName.slice(1)}` : 'The library'} uses ${lostInherited.map((item) => `"${item.name}"`).join(', ')}, which the library no longer has. It is still shown here, from what the event saved. To stop showing it, replace the default with a ${noun} of your own.`}
            severity="warning"
          />
        ) : null}

        {effective.length === 0 ? (
          <StateBlock variant="empty" title={`No ${noun} is used here`} description={mode === 'none' ? `You chose to show no ${noun} here.` : `There is no ${noun} to use yet. Pick one or upload one.`} />
        ) : (
          <GdsGrid columns="auto-fill" minColumnWidth="aside" gap="md">
            {effective.map((item) => (
              <GdsStack key={item.id} gap="xs">
                <MediaPreviewCard
                  title={item.name}
                  src={item.imageUrl ?? undefined}
                  thumbnailSrc={item.thumbnailUrl ?? undefined}
                  alt={item.name}
                  status={levelTag(item)}
                  hideWhenNoMedia={false}
                />
                {item.lost && ownIds.has(item.id) && onKeepLost ? (
                  <SemanticButton action="slot:keep-lost" size="xs" disabled={busy} onClick={() => void onKeepLost(item.id)}>
                    Keep as own
                  </SemanticButton>
                ) : null}
                {ownIds.has(item.id) ? (
                  <SemanticButton action="slot:remove" variant="secondary" size="xs" disabled={busy} onClick={() => void remove(item.id)}>
                    Remove
                  </SemanticButton>
                ) : null}
              </GdsStack>
            ))}
          </GdsGrid>
        )}
        {effective.length > 1 ? <MetadataText>More than one {noun} is used here: a user sees one of them, picked at random.</MetadataText> : null}

        {own.items.length > 0 && parentName && defaultItems.length > 0 ? (
          <AdminCheckbox
            name={`use-default-${title}`}
            label={`Also use the ${noun} from ${parentName}`}
            checked={own.useDefault}
            disabled={busy}
            onChange={() => void save(own.items, !own.useDefault)}
          />
        ) : null}

        <GdsInline gap="sm" align="end">
          {pickable.length > 0 ? (
            <>
              <AdminSelect
                name={`pick-${title}`}
                label={`Pick a ${noun} from the library`}
                value={pick}
                onChange={(next) => setPick(typeof next === 'string' ? next : '')}
                data={pickable.map((item) => ({ value: item.id, label: item.name }))}
                placeholder={`Choose a ${noun}`}
                allowDeselect
              />
              <SemanticButton
                action="slot:add"
                disabled={busy || !pick}
                onClick={() => {
                  void add(pick);
                  setPick('');
                }}
              >
                Use this one
              </SemanticButton>
            </>
          ) : null}
          {upload ? (
            <SemanticButton action={uploading ? 'slot:upload-close' : 'slot:upload-open'} variant="secondary" disabled={busy} onClick={() => setUploading((open) => !open)}>
              {uploading ? 'Close the upload' : 'Upload a new one'}
            </SemanticButton>
          ) : null}
          {mode !== 'default' && parentName ? (
            <SemanticButton action="slot:use-default" variant="secondary" disabled={busy} onClick={() => void onChange({})}>
              Use the default again
            </SemanticButton>
          ) : null}
          {mode === 'default' && parentName ? (
            <SemanticButton action="slot:none" variant="secondary" disabled={busy} onClick={() => void onChange({ useDefault: false })}>
              Show nothing here
            </SemanticButton>
          ) : null}
        </GdsInline>

        {upload && uploading ? (
          <LibraryUploadForm
            endpoint={upload.endpoint}
            kind="logos"
            noun={noun}
            accept={upload.accept}
            acceptWords={upload.acceptWords}
            maxBytes={upload.maxBytes}
            maxWords={upload.maxWords}
            extraFields={upload.extraFields}
            onUploaded={async () => {
              setUploading(false);
              await onUploaded?.();
            }}
          />
        ) : null}
      </GdsStack>
    </SectionPanel>
  );
}
