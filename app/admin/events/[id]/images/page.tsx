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
import VisualAssetPolicyActions from '@/components/admin/library/VisualAssetPolicyActions';
import LibraryUploadActiveToggle from '@/components/admin/library/LibraryUploadActiveToggle';
import EventExperienceReviewPanel from '@/components/admin/EventExperienceReviewPanel';
import AssetUsageResolution from '@/components/admin/library/AssetUsageResolution';
import { InlineAlert, StateBlock, useGdsConfirm } from '@sovereignsquad/gds-core/client';
import VisibilityStatusIcon from '@/components/gds/VisibilityStatusIcon';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES, IMAGE_MAX_WORDS } from '@/lib/library/image-files';
import type { EventLibrary } from '@/lib/library/types';

interface Payload<T> {
  data?: T;
  error?: string;
}

const GRID = { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' } as const;
const SECTION = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', overflow: 'hidden' } as const;

class AdminRequestFailure extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload) throw new AdminRequestFailure(payload?.error || `Request failed (${response.status})`, response.status);
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
  const [usageConflict, setUsageConflict] = useState<string | null>(null);
  const { confirmDestructive } = useGdsConfirm();

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
    const confirmed = await confirmDestructive({ title: 'Delete image upload', message: 'This removes the image from this event library. Replace its use or upload a copy before deleting.', targetName: name });
    if (!confirmed) return;
    setBusy(true);
    setActionError(null);
    try {
      await call(`/api/events/${eventId}/library/items/${pictureId}?kind=images`, { method: 'DELETE' });
      setUsageConflict(null);
      await reload();
    } catch (deleteError) {
      if (deleteError instanceof AdminRequestFailure && deleteError.status === 409) setUsageConflict(pictureId);
      else setActionError(errorText(deleteError));
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
        description={`The pictures ${eventName} can use. Choose from ${partnerName}'s library or upload for this event. Welcome page artwork, the CTA graphic, email footer, slideshow overlay and failover background choose from these images in their editors. Selfie frames are managed separately under Frames.`}
      />
      {usageConflict ? <AssetUsageResolution kind="images" assetId={usageConflict} /> : null}

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
                    <>
                      {item.scope !== 'event' ? <VisualAssetPolicyActions level="event" ownerId={eventId} kind="images" id={item.id} scope={item.scope} onSaved={reload} /> : null}
                      {item.scope === 'event' ? <SemanticButton action="library:delete-upload" variant="danger" size="xs" disabled={busy} onClick={() => void deleteUpload(item.id, item.name)}>Delete upload</SemanticButton> : null}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {library.inheritanceEnabled && library.hidden?.length ? <section style={SECTION} aria-labelledby="hidden-event-images-heading">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 id="hidden-event-images-heading" style={{ margin: 0 }}>Hidden at this event ({library.hidden.length})</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>Restore an item here without changing its partner or global sharing rules.</p>
        </div>
        <div style={{ padding: '1rem' }}><div style={GRID}>{library.hidden.map((item) => <LibraryItemCard key={item.id} name={item.name} imageUrl={item.imageUrl} thumbnailUrl={item.thumbnailUrl} noun="image" scope={item.scope} badges={<VisibilityStatusIcon isVisible={false} />} actions={<VisualAssetPolicyActions level="event" ownerId={eventId} kind="images" id={item.id} scope={item.scope} hidden onSaved={reload} />} />)}</div></div>
      </section> : null}

      {library.inactiveOwn.length > 0 ? <section style={SECTION} aria-labelledby="inactive-event-images-heading">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 id="inactive-event-images-heading" style={{ margin: 0 }}>Switched off at this event ({library.inactiveOwn.length})</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>These event uploads are unavailable in this event. Switch one on to make it selectable again.</p>
        </div>
        <div style={{ padding: '1rem' }}><div style={GRID}>{library.inactiveOwn.map((item) => <LibraryItemCard key={item.id} name={item.name} imageUrl={item.imageUrl} thumbnailUrl={item.thumbnailUrl} noun="image" scope="event" badges={<VisibilityStatusIcon isVisible={false} />} actions={<LibraryUploadActiveToggle level="event" ownerId={eventId} kind="images" id={item.id} itemActive={false} onSaved={reload} />} />)}</div></div>
      </section> : null}

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

      <EventExperienceReviewPanel eventId={eventId} />

      <Link href={`/admin/events/${eventId}`}>← Back to Event</Link>
    </div>
  );
}
