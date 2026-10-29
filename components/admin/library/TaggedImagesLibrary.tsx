'use client';

/**
 * The global page of a tagged library picture (issue 540 for the sample selfie, issue 326 for the stadium background): the general pictures of the kind. The active ones are the default of every
 * partner (a partner follows them until it chooses or uploads its own). Upload, switch off or on, delete. Only images cleared for commercial use are uploaded here (owner answer 256): there is no
 * tick; an image with a problem is switched off or deleted and never used again. Deleting asks in the page (never the browser's own confirm, CLAUDE.md section 5). What a kind is called and
 * where its routes are is in `./tagged-kinds.ts`.
 */

import { useCallback, useEffect, useState } from 'react';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import ShareToChildrenToggle from '@/components/admin/library/ShareToChildrenToggle';
import AssetUsageResolution from '@/components/admin/library/AssetUsageResolution';
import { TAGGED_KINDS, type TaggedKind } from '@/components/admin/library/tagged-kinds';
import { InlineAlert, LabelTag, StateBlock } from '@sovereignsquad/gds-core/client';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES, IMAGE_MAX_WORDS } from '@/lib/library/image-files';
import type { LibraryItemView } from '@/lib/library/types';

interface Payload<T> {
  data?: T;
  error?: string;
}

class AdminRequestFailure extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const GRID = { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' } as const;
const SECTION = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', overflow: 'hidden' } as const;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload?.data) throw new AdminRequestFailure(payload?.error || `Request failed (${response.status})`, response.status);
  return payload.data;
}

export default function TaggedImagesLibrary({ kind }: { kind: TaggedKind }) {
  const info = TAGGED_KINDS[kind];
  const [items, setItems] = useState<LibraryItemView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [usageConflict, setUsageConflict] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setItems((await call<{ items: LibraryItemView[] }>(info.globalEndpoint)).items);
  }, [info.globalEndpoint]);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await reload();
      } catch (loadError) {
        setError(errorText(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, [reload]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await run();
      await reload();
    } catch (actionFailure) {
      setActionError(errorText(actionFailure));
    } finally {
      setBusy(false);
    }
  };

  const setActive = (pictureId: string, isActive: boolean) =>
    act(() => call(`/api/images/${pictureId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) }));
  const remove = async (pictureId: string) => {
    setDeleting(null);
    setBusy(true);
    setActionError(null);
    try {
      await call(`/api/images/${pictureId}`, { method: 'DELETE' });
      setUsageConflict(null);
      await reload();
    } catch (failure) {
      if (failure instanceof AdminRequestFailure && failure.status === 409) {
        setUsageConflict(pictureId);
        setActionError(null);
      } else setActionError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const header = <WorkspaceHeader eyebrow="Resource Inventory" title={info.title} description={info.pageDescription} />;

  if (loading) return <StateBlock variant="loading" title={`Loading the ${info.plural}...`} />;
  if (error || !items) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        {header}
        <InlineAlert title="Error" message={error || `The ${info.plural} could not be loaded`} severity="error" />
      </div>
    );
  }

  const active = items.filter((item) => item.itemActive).length;

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {header}
      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}
      {usageConflict ? <AssetUsageResolution kind="images" assetId={usageConflict} /> : null}
      <section style={SECTION}>
        <div style={{ borderBottom: '1px solid var(--mantine-color-default-border)', padding: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>{`In the library (${items.length}, ${active} active)`}</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>{info.listNote}</p>
        </div>
        <div style={{ padding: '1rem' }}>
          {items.length === 0 ? (
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '2rem 0', textAlign: 'center' }}>{info.emptyText}</p>
          ) : (
            <div style={GRID}>
              {items.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  thumbnailUrl={item.thumbnailUrl}
                  noun={info.noun}
                  scope={item.scope}
                  badges={!item.itemActive ? <LabelTag tone="warning" label="Switched off" /> : null}
                  actions={
                    deleting?.id === item.id ? (
                      // The question sits on the card it is about, not at the top of a long page (CLAUDE.md section 5).
                      <>
                        <span style={{ fontSize: '0.8125rem', width: '100%' }}>Delete it for good? Partners and events that chose it use the next one instead.</span>
                        <SemanticButton action="library:confirm-delete" variant="danger" size="xs" disabled={busy} onClick={() => void remove(item.id)}>
                          Yes, delete it
                        </SemanticButton>
                        <SemanticButton action="library:cancel-delete" variant="secondary" size="xs" disabled={busy} onClick={() => setDeleting(null)}>
                          Cancel
                        </SemanticButton>
                      </>
                    ) : (
                      <>
                        <SemanticButton action={item.itemActive ? 'library:switch-off' : 'library:switch-on'} variant="secondary" size="xs" disabled={busy} onClick={() => void setActive(item.id, !item.itemActive)}>
                          {item.itemActive ? 'Switch off' : 'Switch on'}
                        </SemanticButton>
                        <ShareToChildrenToggle kind="images" id={item.id} shareToChildren={item.shareToChildren} disabled={busy || !item.itemActive} onSaved={reload} />
                        <SemanticButton action="library:delete" variant="danger" size="xs" disabled={busy} onClick={() => setDeleting({ id: item.id, name: item.name })}>
                          Delete
                        </SemanticButton>
                      </>
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ borderBottom: '1px solid var(--mantine-color-default-border)', padding: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>{`Upload a ${info.noun}`}</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>{info.uploadHint}</p>
        </div>
        <div style={{ padding: '1rem' }}>
          <LibraryUploadForm
            endpoint={info.globalEndpoint}
            kind="images"
            noun={info.noun}
            accept={IMAGE_FILE_TYPES.join(',')}
            acceptWords={IMAGE_FILE_WORDS}
            maxBytes={IMAGE_MAX_BYTES}
            maxWords={IMAGE_MAX_WORDS}
            namePlaceholder={info.namePlaceholder}
            onUploaded={reload}
          />
        </div>
      </section>
    </div>
  );
}
