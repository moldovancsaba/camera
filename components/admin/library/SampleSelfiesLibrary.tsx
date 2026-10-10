'use client';

/**
 * The global sample selfies (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): the general selfies that fill the photo window of the welcome page screen for every event that has nothing of its own.
 * The active ones are the default of every partner (a partner follows them until it chooses or uploads its own). Upload, switch off or on, delete. Only images cleared for commercial use
 * are uploaded here (owner answer 256): there is no tick; an image with a problem is switched off or deleted and never used again.
 */

import { useCallback, useEffect, useState } from 'react';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import { InlineAlert, LabelTag, StateBlock } from '@sovereignsquad/gds-core/client';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES, IMAGE_MAX_WORDS } from '@/lib/library/image-files';
import type { LibraryItemView } from '@/lib/library/types';

interface Payload<T> {
  data?: T;
  error?: string;
}

const GRID = { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' } as const;
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

export default function SampleSelfiesLibrary() {
  const [items, setItems] = useState<LibraryItemView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setItems((await call<{ items: LibraryItemView[] }>('/api/sample-selfies')).items);
  }, []);

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
    if (!confirm(`Delete "${name}" for good? Partners and events that chose it use the next one instead.`)) return Promise.resolve();
    return act(() => call(`/api/images/${pictureId}`, { method: 'DELETE' }));
  };

  const header = (
    <WorkspaceHeader
      eyebrow="Resource Inventory"
      title="Sample selfies"
      description="The general selfies that fill the photo window of the welcome page screen. The active ones are the default of every partner until it chooses or uploads its own; an event follows its partner and gets one of them at random."
    />
  );

  if (loading) return <StateBlock variant="loading" title="Loading the sample selfies..." />;
  if (error || !items) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        {header}
        <InlineAlert title="Error" message={error || 'The sample selfies could not be loaded'} severity="error" />
      </div>
    );
  }

  const active = items.filter((item) => item.itemActive).length;

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {header}
      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}

      <section style={SECTION}>
        <div style={{ borderBottom: '1px solid var(--mantine-color-default-border)', padding: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>{`In the library (${items.length}, ${active} active)`}</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>
            A sample selfie switched off is no longer used anywhere. With none active, the welcome page screen shows the drawn stand-in, as before.
          </p>
        </div>
        <div style={{ padding: '1rem' }}>
          {items.length === 0 ? (
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '2rem 0', textAlign: 'center' }}>No sample selfies yet. Upload the first one below; until then every welcome page screen shows the stand-in.</p>
          ) : (
            <div style={GRID}>
              {items.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  thumbnailUrl={item.thumbnailUrl}
                  noun="sample selfie"
                  scope={item.scope}
                  badges={!item.itemActive ? <LabelTag tone="warning" label="Switched off" /> : null}
                  actions={
                    <>
                      <SemanticButton action={item.itemActive ? 'library:switch-off' : 'library:switch-on'} variant="secondary" size="xs" disabled={busy} onClick={() => void setActive(item.id, !item.itemActive)}>
                        {item.itemActive ? 'Switch off' : 'Switch on'}
                      </SemanticButton>
                      <SemanticButton action="library:delete" variant="danger" size="xs" disabled={busy} onClick={() => void remove(item.id, item.name)}>
                        Delete
                      </SemanticButton>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ borderBottom: '1px solid var(--mantine-color-default-border)', padding: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>Upload a sample selfie</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>Only images cleared for commercial use. A portrait or a square picture of one person works best; the event’s frame is drawn over it.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          <LibraryUploadForm
            endpoint="/api/sample-selfies"
            kind="images"
            noun="sample selfie"
            accept={IMAGE_FILE_TYPES.join(',')}
            acceptWords={IMAGE_FILE_WORDS}
            maxBytes={IMAGE_MAX_BYTES}
            maxWords={IMAGE_MAX_WORDS}
            namePlaceholder="e.g. Fan with a scarf"
            onUploaded={reload}
          />
        </div>
      </section>
    </div>
  );
}
