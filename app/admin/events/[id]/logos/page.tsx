'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
/**
 * Event Logos Management Page
 *
 * Manage logo assignments for event scenarios.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { InlineAlert, StateBlock } from '@doneisbetter/gds-core/client';

interface Logo {
  logoId: string;
  name: string;
  imageUrl: string;
  thumbnailUrl: string;
  isActive: boolean;
}

interface LogoAssignment {
  logoId: string;
  scenario: string;
  order: number;
  isActive: boolean;
  addedAt: string;
  name: string;
  imageUrl: string;
  thumbnailUrl: string;
}

interface EventLogosRecord {
  _id: string;
  name: string;
}

interface EventLogosResponse {
  eventId?: string;
  eventName?: string;
  logos?: Record<string, LogoAssignment[]>;
  data?: {
    eventId?: string;
    eventName?: string;
    logos?: Record<string, LogoAssignment[]>;
  };
  error?: string;
}

interface LogosResponse {
  logos?: Logo[];
  data?: { logos?: Logo[] };
  error?: string;
}

const SCENARIOS = [
  { id: 'slideshow-transition', name: 'Slideshow Transition', description: 'Logo shown during slide transitions with fade in/out' },
  { id: 'onboarding-thankyou', name: 'Onboarding/Thank You Pages', description: 'Logo displayed at top center on custom pages' },
  { id: 'loading-slideshow', name: 'Loading Slideshow', description: 'Logo shown while slideshow is loading' },
  { id: 'loading-capture', name: 'Loading Capture App', description: 'Logo shown while capture app is loading' },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function EventLogosPage({ params }: { params: Promise<{ id: string }> }) {
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState<EventLogosRecord | null>(null);
  const [availableLogos, setAvailableLogos] = useState<Logo[]>([]);
  const [assignedLogos, setAssignedLogos] = useState<Record<string, LogoAssignment[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolved) => setEventId(resolved.id));
  }, [params]);

  const refreshAssignments = async (currentEventId: string) => {
    const eventResponse = await fetch(`/api/events/${currentEventId}/logos`);
    const eventData: EventLogosResponse = await eventResponse.json();
    const assignedLogosData = eventData.data?.logos || eventData.logos || {};
    setAssignedLogos(assignedLogosData);
  };

  useEffect(() => {
    if (!eventId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);

        const eventResponse = await fetch(`/api/events/${eventId}/logos`);
        const eventData: EventLogosResponse = await eventResponse.json();
        if (!eventResponse.ok) {
          throw new Error(eventData.error || 'Failed to load event');
        }
        const resolvedEventId = eventData.data?.eventId || eventData.eventId;
        const resolvedEventName = eventData.data?.eventName || eventData.eventName;
        if (!resolvedEventId || !resolvedEventName) {
          throw new Error('Event not found');
        }

        setEvent({ _id: resolvedEventId, name: resolvedEventName });
        setAssignedLogos(eventData.data?.logos || eventData.logos || {});

        const logosResponse = await fetch('/api/logos?active=true&limit=100');
        const logosData: LogosResponse = await logosResponse.json();
        if (!logosResponse.ok) {
          throw new Error(logosData.error || 'Failed to load logos');
        }
        setAvailableLogos(logosData.logos || logosData.data?.logos || []);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [eventId]);

  const handleAssignLogo = async (logoId: string, scenario: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/logos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoId, scenario, isActive: true }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign logo');
      }
      await refreshAssignments(eventId);
    } catch (assignError) {
      alert(getErrorMessage(assignError));
    }
  };

  const handleRemoveLogo = async (logoId: string) => {
    if (!confirm('Remove this logo from the event?')) return;

    try {
      const response = await fetch(`/api/events/${eventId}/logos/${logoId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove logo');
      }
      await refreshAssignments(eventId);
    } catch (removeError) {
      alert(getErrorMessage(removeError));
    }
  };

  const handleToggleLogo = async (logoId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/logos/${logoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle' }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle logo');
      }
      await refreshAssignments(eventId);
    } catch (toggleError) {
      alert(getErrorMessage(toggleError));
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading logos..." />;
  }

  if (error || !event) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <InlineAlert title="Error" message={error || 'Event not found'} severity="error" />
        <Link href="/admin/events">← Back to Events</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href="/admin/events">Events</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/events/${eventId}`}>{event.name}</Link>
        <span aria-hidden> / </span>
        <span>Logos</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Events"
        title="Manage Event Logos"
        description={`Assign logos to scenarios for ${event.name}`}
      />

      <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
        Multiple active logos per scenario means random selection on each display.
      </p>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {SCENARIOS.map((scenario) => {
          const scenarioLogos = assignedLogos[scenario.id] || [];
          const assignedLogoIds = scenarioLogos.map((logo) => logo.logoId);
          const unassignedLogos = availableLogos.filter((logo) => !assignedLogoIds.includes(logo.logoId));

          return (
            <section key={scenario.id} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
                <h3 style={{ margin: 0 }}>{scenario.name}</h3>
                <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
                  {scenario.description}
                </p>
              </div>

              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', padding: '1rem' }}>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <strong style={{ fontSize: '0.875rem' }}>
                    Assigned ({scenarioLogos.length})
                  </strong>
                  {scenarioLogos.length === 0 ? (
                    <div style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', padding: '2rem 1rem' }}>
                      <p style={{ color: 'var(--gds-color-muted)', margin: 0, textAlign: 'center' }}>
                        No logos assigned
                      </p>
                    </div>
                  ) : (
                    scenarioLogos.map((logo) => (
                      <article key={logo.logoId} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
                          <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem' }}>
                            <Image src={logo.thumbnailUrl} alt={logo.name} width={48} height={48} unoptimized style={{ width: 48, height: 48, objectFit: 'contain' }} />
                            <strong style={{ fontSize: '0.875rem' }}>
                              {logo.name}
                            </strong>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <SemanticButton action="event-logos:toggle" variant="secondary" size="xs" onClick={() => void handleToggleLogo(logo.logoId)}>
                              {logo.isActive ? 'Active' : 'Inactive'}
                            </SemanticButton>
                            <SemanticButton action="event-logos:remove" variant="danger" size="xs" onClick={() => void handleRemoveLogo(logo.logoId)}>
                              Remove
                            </SemanticButton>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <strong style={{ fontSize: '0.875rem' }}>
                    Available ({unassignedLogos.length})
                  </strong>
                  {unassignedLogos.length === 0 ? (
                    <div style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', padding: '2rem 1rem' }}>
                      <p style={{ color: 'var(--gds-color-muted)', margin: 0, textAlign: 'center' }}>
                        All logos are assigned
                      </p>
                    </div>
                  ) : (
                    unassignedLogos.map((logo) => (
                      <article key={logo.logoId} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
                          <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem' }}>
                            <Image src={logo.thumbnailUrl} alt={logo.name} width={48} height={48} unoptimized style={{ width: 48, height: 48, objectFit: 'contain' }} />
                            <strong style={{ fontSize: '0.875rem' }}>
                              {logo.name}
                            </strong>
                          </div>
                          <SemanticButton action="event-logos:assign" size="xs" onClick={() => void handleAssignLogo(logo.logoId, scenario.id)}>
                            Assign
                          </SemanticButton>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <Link href={`/admin/events/${eventId}`}>← Back to Event</Link>
    </div>
  );
}
