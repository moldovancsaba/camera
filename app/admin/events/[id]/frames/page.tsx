'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
/**
 * Event Frame Management Page
 *
 * Manage frame assignments for an event.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { InlineAlert, StateBlock } from '@doneisbetter/gds-core/client';

interface EventFrameAssignment {
  frameId: string;
  isActive: boolean;
}

interface EventRecord {
  name: string;
  frames?: EventFrameAssignment[];
}

interface FrameRecord {
  frameId: string;
  name: string;
  thumbnailUrl?: string;
  hashtags?: string[];
}

interface EventResponse {
  data?: { event?: EventRecord };
  event?: EventRecord;
  error?: string;
}

interface FramesResponse {
  data?: { frames?: FrameRecord[] };
  error?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function EventFramesPage({ params }: { params: Promise<{ id: string }> }) {
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [availableFrames, setAvailableFrames] = useState<FrameRecord[]>([]);
  const [assignedFrames, setAssignedFrames] = useState<EventFrameAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolved) => setEventId(resolved.id));
  }, [params]);

  useEffect(() => {
    if (!eventId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const eventResponse = await fetch(`/api/events/${eventId}`);
        const eventData: EventResponse = await eventResponse.json();
        if (!eventResponse.ok) {
          throw new Error(eventData.error || 'Failed to load event');
        }

        const eventRecord = eventData.data?.event || eventData.event;
        if (!eventRecord) {
          throw new Error('Event not found');
        }
        setEvent(eventRecord);
        setAssignedFrames(eventRecord.frames || []);

        const framesResponse = await fetch('/api/frames?active=true&limit=100');
        const framesData: FramesResponse = await framesResponse.json();
        if (!framesResponse.ok) {
          throw new Error(framesData.error || 'Failed to load frames');
        }
        setAvailableFrames(framesData.data?.frames || []);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [eventId]);

  const refreshEvent = async () => {
    const eventResponse = await fetch(`/api/events/${eventId}`);
    const eventData: EventResponse = await eventResponse.json();
    const eventRecord = eventData.data?.event || eventData.event;
    if (!eventRecord) {
      throw new Error('Event not found');
    }
    setEvent(eventRecord);
    setAssignedFrames(eventRecord.frames || []);
  };

  const handleAssignFrame = async (frameId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameId, isActive: true }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to assign frame');
      }
      await refreshEvent();
    } catch (assignError) {
      alert(getErrorMessage(assignError));
    }
  };

  const handleRemoveFrame = async (frameId: string) => {
    if (!confirm('Remove this frame from the event?')) return;

    try {
      const response = await fetch(`/api/events/${eventId}/frames/${frameId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove frame');
      }
      await refreshEvent();
    } catch (removeError) {
      alert(getErrorMessage(removeError));
    }
  };

  const handleToggleFrame = async (frameId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/frames/${frameId}/toggle`, { method: 'PATCH' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle frame');
      }
      await refreshEvent();
    } catch (toggleError) {
      alert(getErrorMessage(toggleError));
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading frames..." />;
  }

  if (error || !event) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <InlineAlert title="Error" message={error || 'Event not found'} severity="error" />
        <Link href="/admin/events">← Back to Events</Link>
      </div>
    );
  }

  const assignedFrameIds = assignedFrames.map((frame) => frame.frameId);
  const unassignedFrames = availableFrames.filter((frame) => !assignedFrameIds.includes(frame.frameId));

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href="/admin/events">Events</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/events/${eventId}`}>{event.name}</Link>
        <span aria-hidden> / </span>
        <span>Frames</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Events"
        title="Manage Event Frames"
        description={`Assign and manage frames for ${event.name}`}
      />

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
        <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
            <h3 style={{ margin: 0 }}>Assigned Frames ({assignedFrames.length})</h3>
          </div>
          <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem' }}>
            {assignedFrames.length === 0 ? (
              <p style={{ color: 'var(--gds-color-muted)', margin: '2rem 0', textAlign: 'center' }}>
                No frames assigned yet
              </p>
            ) : (
              assignedFrames.map((frameAssignment) => {
                const frame = availableFrames.find((availableFrame) => availableFrame.frameId === frameAssignment.frameId);
                return (
                  <article key={frameAssignment.frameId} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
                      <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem' }}>
                        {frame?.thumbnailUrl ? (
                          <Image src={frame.thumbnailUrl} alt={frame.name} width={64} height={64} unoptimized style={{ width: 64, height: 'auto', objectFit: 'contain' }} />
                        ) : (
                          <span aria-hidden>Image</span>
                        )}
                        <div>
                          <strong style={{ fontSize: '0.875rem' }}>
                            {frame?.name || frameAssignment.frameId}
                          </strong>
                          <code style={{ color: 'var(--gds-color-muted)', display: 'block', fontSize: '0.75rem' }}>
                            {frameAssignment.frameId}
                          </code>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <SemanticButton
                          action="event-frames:toggle"
                          variant="secondary"
                          size="xs"
                          onClick={() => void handleToggleFrame(frameAssignment.frameId)}
                        >
                          {frameAssignment.isActive ? 'Active' : 'Inactive'}
                        </SemanticButton>
                        <SemanticButton action="event-frames:remove" variant="danger" size="xs" onClick={() => void handleRemoveFrame(frameAssignment.frameId)}>
                          Remove
                        </SemanticButton>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
            <h3 style={{ margin: 0 }}>Available Frames ({unassignedFrames.length})</h3>
          </div>
          <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem' }}>
            {unassignedFrames.length === 0 ? (
              <p style={{ color: 'var(--gds-color-muted)', margin: '2rem 0', textAlign: 'center' }}>
                All frames are assigned
              </p>
            ) : (
              unassignedFrames.map((frame) => (
                <article key={frame.frameId} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                  <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
                    <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem' }}>
                      {frame.thumbnailUrl ? (
                        <Image src={frame.thumbnailUrl} alt={frame.name} width={64} height={64} unoptimized style={{ width: 64, height: 'auto', objectFit: 'contain' }} />
                      ) : (
                        <span aria-hidden>Image</span>
                      )}
                      <div>
                        <strong style={{ fontSize: '0.875rem' }}>
                          {frame.name}
                        </strong>
                        <span style={{ color: 'var(--gds-color-muted)', display: 'block', fontSize: '0.75rem' }}>
                          {frame.hashtags?.join(', ') || 'No hashtags'}
                        </span>
                      </div>
                    </div>
                    <SemanticButton action="event-frames:assign" size="xs" onClick={() => void handleAssignFrame(frame.frameId)}>
                      Assign
                    </SemanticButton>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <Link href={`/admin/events/${eventId}`}>← Back to Event</Link>
    </div>
  );
}
