'use client';

/**
 * Partner library: frames (camera#361, docs/LIBRARIES.md)
 *
 * The frames a partner can use: the ones it took from the global library, plus the ones it uploaded itself. Its events take their frames from
 * this library only. A frame marked "default for new events" is assigned to every new event of the partner and follows later changes until an
 * event edits its own list. Partner managers and global admins.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import { InlineAlert, LabelTag, StateBlock } from '@sovereignsquad/gds-core/client';
import type { PartnerLibrary } from '@/lib/library/types';

interface PartnerRecord {
  name: string;
}

interface Payload<T> {
  data?: T;
  error?: string;
}

const GRID = { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' } as const;
const SECTION = { border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' } as const;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data;
}

export default function PartnerFramesPage({ params }: { params: Promise<{ id: string }> }) {
  const [partnerId, setPartnerId] = useState('');
  const [partner, setPartner] = useState<PartnerRecord | null>(null);
  const [library, setLibrary] = useState<PartnerLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    params.then((resolved) => setPartnerId(resolved.id));
  }, [params]);

  const reload = useCallback(async () => {
    if (!partnerId) return;
    setLibrary(await call<PartnerLibrary>(`/api/partners/${partnerId}/library?kind=frames`));
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

  const edit = async (change: { add?: string[]; remove?: string[]; defaults?: string[] }) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await call<{ library: PartnerLibrary; removedInUse: Record<string, number> }>(`/api/partners/${partnerId}/library`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'frames', ...change }),
      });
      setLibrary(result.library);
      const inUse = Object.values(result.removedInUse);
      if (inUse.length > 0) {
        const events = inUse.reduce((sum, count) => sum + count, 0);
        setNotice(`Removed. ${events} event${events === 1 ? '' : 's'} still use${events === 1 ? 's' : ''} a frame you removed: they keep it, and their pages mark it as no longer in this library.`);
      }
    } catch (editError) {
      setActionError(errorText(editError));
    } finally {
      setBusy(false);
    }
  };

  const deleteUpload = async (itemId: string, name: string) => {
    if (!confirm(`Delete "${name}"? It was uploaded for this partner and is removed for good.`)) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await call<{ deleted: string }>(`/api/partners/${partnerId}/library/items/${itemId}?kind=frames`, { method: 'DELETE' });
      await reload();
    } catch (deleteError) {
      setActionError(errorText(deleteError));
    } finally {
      setBusy(false);
    }
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

  const defaults = library.items.filter((item) => item.isDefault).map((item) => item.id);

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href="/admin/partners">Partners</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/partners/${partnerId}`}>{partner.name}</Link>
        <span aria-hidden> / </span>
        <span>Frames</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Partners"
        title="Partner library: frames"
        description={`The frames ${partner.name} can use. Its events take their frames from this library only: add frames from the global library, or upload frames for this partner.`}
      />

      {!library.saved ? (
        <InlineAlert
          title="This list is what the partner already had"
          message="It is the partner's default frames and the frames its events already use. The first change you save makes it the partner's own list; nothing is removed by that."
          severity="info"
        />
      ) : null}
      {library.missing.length > 0 ? (
        <InlineAlert title="A frame is missing" message={`${library.missing.length} frame${library.missing.length === 1 ? '' : 's'} this partner used no longer exist${library.missing.length === 1 ? 's' : ''} in the library and ${library.missing.length === 1 ? 'is' : 'are'} not listed.`} severity="warning" />
      ) : null}
      {notice ? <InlineAlert title="Removed from the library" message={notice} severity="info" /> : null}
      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
          <h3 style={{ margin: 0 }}>In the partner library ({library.items.length})</h3>
          <p style={{ color: 'var(--gds-color-muted)', margin: '0.35rem 0 0' }}>
            A frame marked as a default is assigned to every new event of {partner.name}, and follows changes here until an event edits its own list.
          </p>
        </div>
        <div style={{ padding: '1rem' }}>
          {library.items.length === 0 ? (
            <p style={{ color: 'var(--gds-color-muted)', margin: '2rem 0', textAlign: 'center' }}>No frames yet. Add one from the global library below, or upload one.</p>
          ) : (
            <div style={GRID}>
              {library.items.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  thumbnailUrl={item.thumbnailUrl}
                  noun="frame"
                  scope={item.scope}
                  badges={
                    <>
                      {item.isDefault ? <LabelTag tone="success" label="Default for new events" /> : null}
                      {!item.itemActive ? <LabelTag tone="warning" label="Switched off in the library" /> : null}
                    </>
                  }
                  actions={
                    <>
                      {item.isDefault ? (
                        <SemanticButton action="library:default-off" variant="secondary" size="xs" disabled={busy} onClick={() => void edit({ defaults: defaults.filter((id) => id !== item.id) })}>
                          Remove the default
                        </SemanticButton>
                      ) : (
                        <SemanticButton action="library:default-on" variant="secondary" size="xs" disabled={busy || !item.itemActive} onClick={() => void edit({ defaults: [...defaults, item.id] })}>
                          Make a default
                        </SemanticButton>
                      )}
                      {item.via === 'own' ? (
                        <SemanticButton action="library:delete-upload" variant="danger" size="xs" disabled={busy} onClick={() => void deleteUpload(item.id, item.name)}>
                          Delete upload
                        </SemanticButton>
                      ) : (
                        <SemanticButton action="library:remove" variant="danger" size="xs" disabled={busy} onClick={() => void edit({ remove: [item.id] })}>
                          Remove from library
                        </SemanticButton>
                      )}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
          <h3 style={{ margin: 0 }}>Add from the global library ({library.available.length})</h3>
          <p style={{ color: 'var(--gds-color-muted)', margin: '0.35rem 0 0' }}>Frames collected by the global admins that {partner.name} does not have yet.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          {library.available.length === 0 ? (
            <p style={{ color: 'var(--gds-color-muted)', margin: '2rem 0', textAlign: 'center' }}>Every global frame is already in this library.</p>
          ) : (
            <div style={GRID}>
              {library.available.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  thumbnailUrl={item.thumbnailUrl}
                  noun="frame"
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
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
          <h3 style={{ margin: 0 }}>Upload a frame for {partner.name}</h3>
          <p style={{ color: 'var(--gds-color-muted)', margin: '0.35rem 0 0' }}>It goes into this library at once. No other partner can take it.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          <LibraryUploadForm endpoint={`/api/partners/${partnerId}/library/upload`} kind="frames" noun="frame" accept="image/png,image/svg+xml" acceptWords="PNG or SVG" onUploaded={reload} />
        </div>
      </section>

      <Link href={`/admin/partners/${partnerId}`}>← Back to Partner</Link>
    </div>
  );
}
