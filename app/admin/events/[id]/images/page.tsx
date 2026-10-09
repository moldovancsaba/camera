'use client';

/**
 * Event library: images (camera#368, docs/LIBRARIES.md)
 *
 * The pictures one event can use: the images of its partner's library (never straight from the global library) and the event's own uploads.
 * An image is not assigned: each picture field of the event (welcome page, CTA page, email footer, giant screen overlay) chooses one of these
 * in its editor, and keeps it as a plain address.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES, IMAGE_MAX_WORDS } from '@/lib/library/image-files';
import type { EventLibrary } from '@/lib/library/types';

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
  if (!response.ok || !payload) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data as T;
}

export default function EventImagesPage({ params }: { params: Promise<{ id: string }> }) {
  const [eventId, setEventId] = useState('');
  const [eventName, setEventName] = useState<string | null>(null);
  const [library, setLibrary] = useState<EventLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    params.then((resolved) => setEventId(resolved.id));
  }, [params]);

  const reload = useCallback(async () => {
    if (!eventId) return;
    setLibrary(await call<EventLibrary>(`/api/events/${eventId}/library?kind=images`));
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    void (async () => {
      try {
        setLoading(true);
        const loaded = await call<{ event?: { name: string } }>(`/api/events/${eventId}`);
        if (!loaded.event) throw new Error('Event not found');
        setEventName(loaded.event.name);
        await reload();
      } catch (loadError) {
        setError(errorText(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId, reload]);

  const deleteUpload = async (pictureId: string, name: string) => {
    if (!confirm(`Delete "${name}"? It leaves the library of this event for good. A page that already shows it keeps showing it.`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await call(`/api/events/${eventId}/library/items/${pictureId}?kind=images`, { method: 'DELETE' });
      await reload();
    } catch (deleteError) {
      setActionError(errorText(deleteError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <StateBlock variant="loading" title="Loading images..." />;

  if (error || !eventName || !library) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <InlineAlert title="Error" message={error || 'Event not found'} severity="error" />
        <Link href="/admin/events">← Back to Events</Link>
      </div>
    );
  }

  const partnerName = library.partner?.name ?? 'its partner';

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href="/admin/events">Events</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/events/${eventId}`}>{eventName}</Link>
        <span aria-hidden> / </span>
        <span>Images</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Events"
        title="Event images"
        description={`The pictures ${eventName} can use. They come from the library of ${partnerName}, or you upload them for this event only. Each picture field (welcome page, CTA page, email footer, giant screen) chooses one in its editor.`}
      />

      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}
      {!library.partner ? <InlineAlert title="No partner" message="This event has no partner, so it has no library to take images from. You can still upload images for this event." severity="warning" /> : null}

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 style={{ margin: 0 }}>Images of this event ({library.available.length})</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>
            From the library of {partnerName}, and uploads for this event. A picture that is not listed here has to be added to the partner library first.
            {library.partner ? (
              <>
                {' '}
                <Link href={`/admin/partners/${library.partner.adminId}/images`}>Open the images of {library.partner.name}</Link>
              </>
            ) : null}
          </p>
        </div>
        <div style={{ padding: '1rem' }}>
          {library.available.length === 0 ? (
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '2rem 0', textAlign: 'center' }}>No images yet. Add images to the library of {partnerName}, or upload one below.</p>
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
                    item.scope === 'event' ? (
                      <SemanticButton action="library:delete-upload" variant="danger" size="xs" disabled={busy} onClick={() => void deleteUpload(item.id, item.name)}>
                        Delete upload
                      </SemanticButton>
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
          <h3 style={{ margin: 0 }}>Upload an image for this event</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>It is in the list above at once. No other event can take it.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          <LibraryUploadForm
            endpoint={`/api/events/${eventId}/library/upload`}
            kind="images"
            noun="image"
            accept={IMAGE_FILE_TYPES.join(',')}
            acceptWords={IMAGE_FILE_WORDS}
            maxBytes={IMAGE_MAX_BYTES}
            maxWords={IMAGE_MAX_WORDS}
            namePlaceholder="e.g. Welcome background"
            onUploaded={reload}
          />
        </div>
      </section>

      <Link href={`/admin/events/${eventId}`}>← Back to Event</Link>
    </div>
  );
}
