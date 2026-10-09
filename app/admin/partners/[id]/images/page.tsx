'use client';

/**
 * Partner library: images (camera#368, docs/LIBRARIES.md)
 *
 * The pictures a partner's events can use in their picture fields (welcome page, CTA page, email footer, giant screen overlay): the ones it took
 * from the global library, plus the ones it uploaded itself. Its events choose from this library only (and from their own uploads). An image is
 * not assigned and has no default for new events. Partner managers and global admins.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import { InlineAlert, LabelTag, StateBlock } from '@sovereignsquad/gds-core/client';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES, IMAGE_MAX_WORDS } from '@/lib/library/image-files';
import type { PartnerLibrary } from '@/lib/library/types';

interface PartnerRecord {
  name: string;
}

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

export default function PartnerImagesPage({ params }: { params: Promise<{ id: string }> }) {
  const [partnerId, setPartnerId] = useState('');
  const [partner, setPartner] = useState<PartnerRecord | null>(null);
  const [library, setLibrary] = useState<PartnerLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    params.then((resolved) => setPartnerId(resolved.id));
  }, [params]);

  const reload = useCallback(async () => {
    if (!partnerId) return;
    setLibrary(await call<PartnerLibrary>(`/api/partners/${partnerId}/library?kind=images`));
  }, [partnerId]);

  useEffect(() => {
    if (!partnerId) return;
    void (async () => {
      try {
        setLoading(true);
        const loaded = await call<{ partner?: PartnerRecord }>(`/api/partners/${partnerId}`);
        if (!loaded.partner) throw new Error('Partner not found');
        setPartner(loaded.partner);
        await reload();
      } catch (loadError) {
        setError(errorText(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, [partnerId, reload]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await run();
    } catch (actionFailure) {
      setActionError(errorText(actionFailure));
    } finally {
      setBusy(false);
    }
  };

  const edit = (change: { add?: string[]; remove?: string[] }) =>
    act(async () => {
      const result = await call<{ library: PartnerLibrary }>(`/api/partners/${partnerId}/library`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'images', ...change }),
      });
      setLibrary(result.library);
    });

  const deleteUpload = (itemId: string, name: string) => {
    if (!confirm(`Delete "${name}"? It leaves the library of this partner for good. A page that already shows it keeps showing it.`)) return Promise.resolve();
    return act(async () => {
      await call<{ deleted: string }>(`/api/partners/${partnerId}/library/items/${itemId}?kind=images`, { method: 'DELETE' });
      await reload();
    });
  };

  if (loading) return <StateBlock variant="loading" title="Loading the partner library..." />;

  if (error || !partner || !library) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <InlineAlert title="Error" message={error || 'Partner not found'} severity="error" />
        <Link href="/admin/partners">← Back to Partners</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href="/admin/partners">Partners</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/partners/${partnerId}`}>{partner.name}</Link>
        <span aria-hidden> / </span>
        <span>Images</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Partners"
        title="Partner library: images"
        description={`The pictures the events of ${partner.name} can use: on the welcome page, the CTA page, in the email footer and on the giant screen. Add pictures from the global library, or upload pictures for this partner.`}
      />

      {library.missing.length > 0 ? (
        <InlineAlert title="An image is missing" message={`${library.missing.length} image${library.missing.length === 1 ? '' : 's'} this partner had no longer exist${library.missing.length === 1 ? 's' : ''} in the library and ${library.missing.length === 1 ? 'is' : 'are'} not listed.`} severity="warning" />
      ) : null}
      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 style={{ margin: 0 }}>In the partner library ({library.items.length})</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>
            The events of {partner.name} choose their pictures from these. Removing a picture does not change a page that already shows it.
          </p>
        </div>
        <div style={{ padding: '1rem' }}>
          {library.items.length === 0 ? (
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '2rem 0', textAlign: 'center' }}>No images yet. Add one from the global library below, or upload one.</p>
          ) : (
            <div style={GRID}>
              {library.items.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  thumbnailUrl={item.thumbnailUrl}
                  noun="image"
                  scope={item.scope}
                  badges={!item.itemActive ? <LabelTag tone="warning" label="Switched off in the library" /> : null}
                  actions={
                    item.via === 'own' ? (
                      <SemanticButton action="library:delete-upload" variant="danger" size="xs" disabled={busy} onClick={() => void deleteUpload(item.id, item.name)}>
                        Delete upload
                      </SemanticButton>
                    ) : (
                      <SemanticButton action="library:remove" variant="danger" size="xs" disabled={busy} onClick={() => void edit({ remove: [item.id] })}>
                        Remove from library
                      </SemanticButton>
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 style={{ margin: 0 }}>Add from the global library ({library.available.length})</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>Pictures collected by the global admins that {partner.name} does not have yet.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          {library.available.length === 0 ? (
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '2rem 0', textAlign: 'center' }}>Every global image is already in this library.</p>
          ) : (
            <div style={GRID}>
              {library.available.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  thumbnailUrl={item.thumbnailUrl}
                  noun="image"
                  scope={item.scope}
                  actions={
                    <SemanticButton action="library:add" size="xs" disabled={busy} onClick={() => void edit({ add: [item.id] })}>
                      Add to library
                    </SemanticButton>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 style={{ margin: 0 }}>Upload an image for {partner.name}</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>It goes into this library at once. No other partner can take it.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          <LibraryUploadForm
            endpoint={`/api/partners/${partnerId}/library/upload`}
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

      <Link href={`/admin/partners/${partnerId}`}>← Back to Partner</Link>
    </div>
  );
}
