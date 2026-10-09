'use client';

/**
 * The global Images library (camera#368, docs/LIBRARIES.md): the pictures the global admins collect for every partner to take into its own library.
 * Upload, switch off or on, delete. With `showAll`, the list also shows what partners and events uploaded for themselves (changed on their own pages).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import { InlineAlert, LabelTag, StateBlock } from '@sovereignsquad/gds-core/client';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES, IMAGE_MAX_WORDS } from '@/lib/library/image-files';
import type { GlobalImageEntry } from '@/lib/library/types';

interface Payload<T> {
  data?: T;
  error?: string;
}

const GRID = { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' } as const;
const SECTION = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', overflow: 'hidden' } as const;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data;
}

export default function GlobalImagesLibrary({ showAll }: { showAll: boolean }) {
  const [items, setItems] = useState<GlobalImageEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setItems((await call<{ items: GlobalImageEntry[] }>(`/api/images${showAll ? '?scope=all' : ''}`)).items);
  }, [showAll]);

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
  const remove = (pictureId: string, name: string) => {
    if (!confirm(`Delete "${name}" from the global library? It is taken out of every partner library. A page that already shows it keeps showing it.`)) return Promise.resolve();
    return act(() => call(`/api/images/${pictureId}`, { method: 'DELETE' }));
  };

  const header = (
    <WorkspaceHeader
      eyebrow="Resource Inventory"
      title="Global Images"
      description={
        showAll
          ? 'Every image, including the ones partners and events uploaded for themselves.'
          : 'The global library: pictures collected for every partner to take into its own library. Events choose their pictures (welcome page, CTA page, email footer, giant screen) from their partner library.'
      }
    />
  );

  if (loading) return <StateBlock variant="loading" title="Loading images..." />;
  if (error || !items) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        {header}
        <InlineAlert title="Error" message={error || 'The images could not be loaded'} severity="error" />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {header}
      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}

      <section style={SECTION}>
        <div style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--mantine-color-default-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', padding: '1.5rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>{showAll ? `Every upload (${items.length})` : `In the global library (${items.length})`}</h3>
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>
              A picture switched off is no longer offered to be newly chosen; a page that already shows it keeps it.
            </p>
          </div>
          <Link href={showAll ? '/admin/images' : '/admin/images?scope=all'}>{showAll ? 'Show the global library only' : 'Show every upload (partners and events too)'}</Link>
        </div>
        <div style={{ padding: '1rem' }}>
          {items.length === 0 ? (
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '2rem 0', textAlign: 'center' }}>No images yet. Upload the first one below.</p>
          ) : (
            <div style={GRID}>
              {items.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  thumbnailUrl={item.thumbnailUrl}
                  noun="image"
                  scope={item.scope}
                  badges={!item.itemActive ? <LabelTag tone="warning" label="Switched off" /> : null}
                  note={item.owner ? `Uploaded for ${item.owner.name}; changed on the Images page of that ${item.owner.level}.` : null}
                  actions={
                    item.scope === 'global' ? (
                      <>
                        <SemanticButton action={item.itemActive ? 'library:switch-off' : 'library:switch-on'} variant="secondary" size="xs" disabled={busy} onClick={() => void setActive(item.id, !item.itemActive)}>
                          {item.itemActive ? 'Switch off' : 'Switch on'}
                        </SemanticButton>
                        <SemanticButton action="library:delete" variant="danger" size="xs" disabled={busy} onClick={() => void remove(item.id, item.name)}>
                          Delete from the library
                        </SemanticButton>
                      </>
                    ) : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 style={{ margin: 0 }}>Upload an image to the global library</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>Every partner can then add it to its own library.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          <LibraryUploadForm
            endpoint="/api/images"
            kind="images"
            noun="image"
            accept={IMAGE_FILE_TYPES.join(',')}
            acceptWords={IMAGE_FILE_WORDS}
            maxBytes={IMAGE_MAX_BYTES}
            maxWords={IMAGE_MAX_WORDS}
            namePlaceholder="e.g. Stadium at night"
            onUploaded={reload}
          />
        </div>
      </section>
    </div>
  );
}
