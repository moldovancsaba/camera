'use client';

/**
 * Event library: frames (camera#361, docs/LIBRARIES.md)
 *
 * The frames of one event. "Assigned" are the frames the event uses; the event takes them from its partner's library (never straight from the
 * global library) or uploads its own. Frames the event has not taken yet are listed under "Available" with their pictures.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import GeneratedFramePanel from '@/components/admin/GeneratedFramePanel';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import MessageAreaEditor from '@/components/admin/library/MessageAreaEditor';
import type { MessageArea } from '@/lib/frame/message-area';
import { InlineAlert, LabelTag, StateBlock } from '@sovereignsquad/gds-core/client';
import type { EventLibrary } from '@/lib/library/types';

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
  if (!response.ok || !payload) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data as T;
}

export default function EventFramesPage({ params }: { params: Promise<{ id: string }> }) {
  const [eventId, setEventId] = useState('');
  const [eventName, setEventName] = useState<string | null>(null);
  const [library, setLibrary] = useState<EventLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolved) => setEventId(resolved.id));
  }, [params]);

  const reload = useCallback(async () => {
    if (!eventId) return;
    setLibrary(await call<EventLibrary>(`/api/events/${eventId}/library?kind=frames`));
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

  const assign = (frameId: string) =>
    act(() => call(`/api/events/${eventId}/frames`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frameId, isActive: true }) }));
  const remove = (frameId: string, name: string) => {
    if (!confirm(`Remove "${name}" from this event?`)) return Promise.resolve();
    return act(() => call(`/api/events/${eventId}/frames/${frameId}`, { method: 'DELETE' }));
  };
  const toggle = (frameId: string) => act(() => call(`/api/events/${eventId}/frames/${frameId}/toggle`, { method: 'PATCH' }));
  const saveMessageArea = async (frameId: string, messageArea: MessageArea | null) => {
    await call(`/api/events/${eventId}/library/items/${frameId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'frames', messageArea }) });
    setEditing(null);
    await reload();
  };
  const deleteUpload = (frameId: string, name: string) => {
    if (!confirm(`Delete "${name}"? It was uploaded for this event and is removed for good.`)) return Promise.resolve();
    return act(() => call(`/api/events/${eventId}/library/items/${frameId}?kind=frames`, { method: 'DELETE' }));
  };

  if (loading) return <StateBlock variant="loading" title="Loading frames..." />;

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
        <span>Frames</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Events"
        title="Manage Event Frames"
        description={`The frames of ${eventName}. It takes them from the library of ${partnerName}, or you upload frames for this event only.`}
      />

      {/* A frame that carries messages is not a frame of the event's own (camera#366); the panel starts again when the frames change, so it offers the current ones. */}
      <GeneratedFramePanel
        key={library.assigned.map((entry) => `${entry.id}:${entry.assignment.isActive === true ? 1 : 0}:${entry.messageArea ? 1 : 0}`).join(',')}
        eventId={eventId}
        onLibraryChanged={reload}
        hasOwnActiveFrame={library.assigned.some((entry) => entry.assignment.isActive === true && entry.messageArea === null)}
      />

      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}
      {!library.partner ? <InlineAlert title="No partner" message="This event has no partner, so it has no library to take frames from. You can still upload frames for this event." severity="warning" /> : null}
      {library.missing.length > 0 ? (
        <InlineAlert
          title={`${library.missing.length} assigned frame${library.missing.length === 1 ? '' : 's'} no longer exist${library.missing.length === 1 ? 's' : ''}`}
          message={
            <span style={{ display: 'grid', gap: '0.5rem' }}>
              {library.missing.map((entry) => (
                <span key={entry.id} style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <code>{entry.id}</code>
                  <SemanticButton action="event-frames:remove" variant="danger" size="xs" disabled={busy} onClick={() => void act(() => call(`/api/events/${eventId}/frames/${entry.id}`, { method: 'DELETE' }))}>
                    Remove frame
                  </SemanticButton>
                </span>
              ))}
            </span>
          }
          severity="warning"
        />
      ) : null}

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
          <h3 style={{ margin: 0 }}>Assigned Frames ({library.assigned.length})</h3>
          <p style={{ color: 'var(--gds-color-muted)', margin: '0.35rem 0 0' }}>The frames this event uses. An event with its own list is no longer changed by the defaults of its partner.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          {library.assigned.length === 0 ? (
            <p style={{ color: 'var(--gds-color-muted)', margin: '2rem 0', textAlign: 'center' }}>No frames assigned yet</p>
          ) : (
            <div style={GRID}>
              {library.assigned.map((entry) => {
                const active = entry.assignment.isActive === true;
                return (
                  <LibraryItemCard
                    key={entry.id}
                    name={entry.name}
                    imageUrl={entry.imageUrl}
                    thumbnailUrl={entry.thumbnailUrl}
                    noun="frame"
                    scope={entry.scope}
                    wide={editing === entry.id}
                    note={entry.messageArea ? 'Guests never pick this frame: the messages of this event are written on it.' : undefined}
                    badges={
                      <>
                        <LabelTag tone={active ? 'success' : 'neutral'} label={active ? 'Active' : 'Inactive'} />
                        {entry.messageArea ? <LabelTag tone="info" label="Carries messages" /> : null}
                        {!entry.stillInPartnerLibrary ? <LabelTag tone="warning" label="No longer in the partner library" /> : null}
                        {!entry.itemActive ? <LabelTag tone="warning" label="Switched off in the library" /> : null}
                      </>
                    }
                    actions={
                      <>
                        <SemanticButton action={active ? 'library:switch-off' : 'library:switch-on'} variant="secondary" size="xs" disabled={busy} onClick={() => void toggle(entry.id)}>
                          {active ? 'Switch off' : 'Switch on'}
                        </SemanticButton>
                        <SemanticButton action="event-frames:remove" variant="danger" size="xs" disabled={busy} onClick={() => void remove(entry.id, entry.name)}>
                          Remove frame
                        </SemanticButton>
                        {entry.scope === 'event' ? (
                          <SemanticButton action="library:message-area" variant="secondary" size="xs" disabled={busy} onClick={() => setEditing(editing === entry.id ? null : entry.id)}>
                            Message area
                          </SemanticButton>
                        ) : null}
                        {entry.scope === 'event' ? (
                          <SemanticButton action="library:delete-upload" variant="danger" size="xs" disabled={busy} onClick={() => void deleteUpload(entry.id, entry.name)}>
                            Delete upload
                          </SemanticButton>
                        ) : null}
                      </>
                    }
                  >
                    {editing === entry.id ? (
                      <MessageAreaEditor pictureUrl={entry.imageUrl} name={entry.name} value={entry.messageArea} disabled={busy} onSave={(area) => saveMessageArea(entry.id, area)} onCancel={() => setEditing(null)} />
                    ) : null}
                  </LibraryItemCard>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
          <h3 style={{ margin: 0 }}>Available Frames ({library.available.length})</h3>
          <p style={{ color: 'var(--gds-color-muted)', margin: '0.35rem 0 0' }}>
            From the library of {partnerName}, and uploads for this event, that the event has not taken yet. A frame that is not listed here has to be added to the partner library first.
            {library.partner ? (
              <>
                {' '}
                <Link href={`/admin/partners/${library.partner.adminId}/frames`}>Open the library of {library.partner.name}</Link>
              </>
            ) : null}
          </p>
        </div>
        <div style={{ padding: '1rem' }}>
          {library.available.length === 0 ? (
            <p style={{ color: 'var(--gds-color-muted)', margin: '2rem 0', textAlign: 'center' }}>Nothing left to assign</p>
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
                  badges={item.messageArea ? <LabelTag tone="info" label="Carries messages" /> : undefined}
                  actions={
                    <SemanticButton action="event-frames:assign" size="xs" disabled={busy} onClick={() => void assign(item.id)}>
                      Assign frame
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
          <h3 style={{ margin: 0 }}>Upload a frame for this event</h3>
          <p style={{ color: 'var(--gds-color-muted)', margin: '0.35rem 0 0' }}>It is assigned to this event at once. No other event can take it.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          <LibraryUploadForm endpoint={`/api/events/${eventId}/library/upload`} kind="frames" noun="frame" accept="image/png,image/svg+xml" acceptWords="PNG or SVG" onUploaded={reload} />
        </div>
      </section>

      <Link href={`/admin/events/${eventId}`}>← Back to Event</Link>
    </div>
  );
}
