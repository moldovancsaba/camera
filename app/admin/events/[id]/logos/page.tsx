'use client';

/**
 * Event library: logos (camera#367, docs/LIBRARIES.md)
 *
 * The logos of one event, per scenario (where a logo is shown). "Assigned" are the logos the event uses in a scenario; the event takes them from
 * its partner's library (never straight from the global library) or uploads its own. The same logo can be assigned to several scenarios, and
 * switching it off or removing it acts on one scenario. In each scenario the guests see the first active logo.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import { InlineAlert, LabelTag, StateBlock } from '@sovereignsquad/gds-core/client';
import { AdminSelect } from '@sovereignsquad/gds-admin/client';
import { DEFAULT_UPLOAD_SCENARIO, LOGO_SCENARIOS, inGuestOrder, isLogoScenario, shownLogo, type LogoScenarioId } from '@/lib/library/logos';
import type { EventLibrary, EventLibraryEntry } from '@/lib/library/types';

interface Payload<T> {
  data?: T;
  error?: string;
}

const COLUMNS = { display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', padding: '1rem' } as const;
const GRID = { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))' } as const;
const SECTION = { border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' } as const;
const EMPTY = { border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', color: 'var(--gds-color-muted)', margin: 0, padding: '2rem 1rem', textAlign: 'center' } as const;
const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';

/** The scenarios for the upload, the one offered first (and chosen) being where an upload goes when the editor does not choose. */
const UPLOAD_SCENARIOS = [...LOGO_SCENARIOS].sort((a, b) => Number(b.id === DEFAULT_UPLOAD_SCENARIO) - Number(a.id === DEFAULT_UPLOAD_SCENARIO)).map((scenario) => ({ value: scenario.id, label: scenario.name }));

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data as T;
}

const scenarioOf = (entry: { assignment: Record<string, unknown> }) => entry.assignment.scenario;

export default function EventLogosPage({ params }: { params: Promise<{ id: string }> }) {
  const [eventId, setEventId] = useState('');
  const [eventName, setEventName] = useState<string | null>(null);
  const [library, setLibrary] = useState<EventLibrary | null>(null);
  const [uploadScenario, setUploadScenario] = useState<LogoScenarioId>(DEFAULT_UPLOAD_SCENARIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    params.then((resolved) => setEventId(resolved.id));
  }, [params]);

  const reload = useCallback(async () => {
    if (!eventId) return;
    setLibrary(await call<EventLibrary>(`/api/events/${eventId}/library?kind=logos`));
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

  const scenarioName = (scenario: unknown) => LOGO_SCENARIOS.find((s) => s.id === scenario)?.name ?? String(scenario ?? 'no scenario');
  const assign = (logoId: string, scenario: LogoScenarioId) =>
    act(() => call(`/api/events/${eventId}/logos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logoId, scenario, isActive: true }) }));
  // With a scenario only that assignment goes; an assignment without a known scenario is removed as a whole (the logo from the event).
  const removeUrl = (logoId: string, scenario: unknown) => `/api/events/${eventId}/logos/${logoId}${isLogoScenario(scenario) ? `?scenario=${scenario}` : ''}`;
  const remove = (logoId: string, scenario: unknown, name: string) => {
    if (!confirm(`Remove "${name}" from ${scenarioName(scenario)}?`)) return Promise.resolve();
    return act(() => call(removeUrl(logoId, scenario), { method: 'DELETE' }));
  };
  const toggle = (logoId: string, scenario: unknown) =>
    act(() =>
      call(`/api/events/${eventId}/logos/${logoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', ...(isLogoScenario(scenario) ? { scenario } : {}) }),
      })
    );
  const deleteUpload = (logoId: string, name: string) => {
    if (!confirm(`Delete "${name}"? It was uploaded for this event and is removed for good, from every scenario.`)) return Promise.resolve();
    return act(() => call(`/api/events/${eventId}/library/items/${logoId}?kind=logos`, { method: 'DELETE' }));
  };

  if (loading) return <StateBlock variant="loading" title="Loading logos..." />;

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
        <span>Logos</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Events"
        title="Manage Event Logos"
        description={`Assign logos to scenarios for ${eventName}. It takes them from the library of ${partnerName}, or you upload logos for this event only.`}
      />

      <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
        When a scenario has more than one active logo, the guests see the first one in the list.
      </p>

      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}
      {!library.partner ? <InlineAlert title="No partner" message="This event has no partner, so it has no library to take logos from. You can still upload logos for this event." severity="warning" /> : null}
      {library.missing.length > 0 ? (
        <InlineAlert
          title={`${library.missing.length} assigned logo${library.missing.length === 1 ? '' : 's'} no longer exist${library.missing.length === 1 ? 's' : ''}`}
          message={
            <span style={{ display: 'grid', gap: '0.5rem' }}>
              {library.missing.map((entry, index) => (
                <span key={`${entry.id}-${String(scenarioOf(entry))}-${index}`} style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <code>{entry.id}</code>
                  <span>{scenarioName(scenarioOf(entry))}</span>
                  <SemanticButton action="event-logos:remove" variant="danger" size="xs" disabled={busy} onClick={() => void act(() => call(removeUrl(entry.id, scenarioOf(entry)), { method: 'DELETE' }))}>
                    Remove logo
                  </SemanticButton>
                </span>
              ))}
            </span>
          }
          severity="warning"
        />
      ) : null}

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {LOGO_SCENARIOS.map((scenario) => {
          // In the order the guest pages use, and the one they show (the first active), as the capture page and the slideshow pick it.
          const rows = library.assigned.filter((entry) => scenarioOf(entry) === scenario.id).map((entry) => ({ entry, order: entry.assignment.order, isActive: entry.assignment.isActive }));
          const assigned = inGuestOrder(rows).map((row) => row.entry);
          const shown = scenario.shownToGuests ? shownLogo(rows)?.entry ?? null : null;
          const taken = new Set(assigned.map((entry) => entry.id));
          const available = library.available.filter((item) => !taken.has(item.id));
          return (
            <section key={scenario.id} style={SECTION}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
                <h3 style={{ margin: 0 }}>{scenario.name}</h3>
                <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>{scenario.description}</p>
                {scenario.id === 'onboarding-thankyou' && !shown ? (
                  <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: '0.35rem 0 0' }}>
                    With no active logo here, these pages show the partner&apos;s logo from messmass, or the event&apos;s emoji.
                  </p>
                ) : null}
              </div>
              <div style={COLUMNS}>
                <div style={{ display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
                  <strong style={{ fontSize: '0.875rem' }}>Assigned ({assigned.length})</strong>
                  {assigned.length === 0 ? (
                    <p style={EMPTY}>No logos assigned</p>
                  ) : (
                    <div style={GRID}>
                      {assigned.map((entry) => (
                        <AssignedLogo
                          key={`${entry.id}-${scenario.id}`}
                          entry={entry}
                          shown={entry === shown}
                          busy={busy}
                          onToggle={() => void toggle(entry.id, scenario.id)}
                          onRemove={() => void remove(entry.id, scenario.id, entry.name)}
                          onDelete={() => void deleteUpload(entry.id, entry.name)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
                  <strong style={{ fontSize: '0.875rem' }}>Available ({available.length})</strong>
                  {available.length === 0 ? (
                    <p style={EMPTY}>Nothing left to assign</p>
                  ) : (
                    <div style={GRID}>
                      {available.map((item) => (
                        <LibraryItemCard
                          key={item.id}
                          name={item.name}
                          imageUrl={item.imageUrl}
                          thumbnailUrl={item.thumbnailUrl}
                          noun="logo"
                          scope={item.scope}
                          source={item.source}
                          actions={
                            <SemanticButton action="event-logos:assign" size="xs" disabled={busy} onClick={() => void assign(item.id, scenario.id)}>
                              Assign logo
                            </SemanticButton>
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
        A logo that is not listed under Available has to be added to the library of {partnerName} first.
        {library.partner ? (
          <>
            {' '}
            <Link href={`/admin/partners/${library.partner.adminId}/logos`}>Open the library of {library.partner.name}</Link>
          </>
        ) : null}
      </p>

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
          <h3 style={{ margin: 0 }}>Upload a logo for this event</h3>
          <p style={{ color: 'var(--gds-color-muted)', margin: '0.35rem 0 0' }}>It is assigned to this event at once, in the scenario you choose. No other event can take it.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          <LibraryUploadForm
            endpoint={`/api/events/${eventId}/library/upload`}
            kind="logos"
            noun="logo"
            accept={ACCEPT}
            acceptWords="PNG, JPG, SVG or WebP"
            namePlaceholder="e.g. Club crest"
            extraFields={{ scenario: uploadScenario }}
            onUploaded={reload}
          >
            <AdminSelect
              name="scenario"
              label="Show it in"
              value={uploadScenario}
              onChange={(value) => setUploadScenario(isLogoScenario(value) ? value : DEFAULT_UPLOAD_SCENARIO)}
              data={UPLOAD_SCENARIOS}
              allowDeselect={false}
            />
          </LibraryUploadForm>
        </div>
      </section>

      <Link href={`/admin/events/${eventId}`}>← Back to Event</Link>
    </div>
  );
}

function AssignedLogo({ entry, shown, busy, onToggle, onRemove, onDelete }: { entry: EventLibraryEntry; shown: boolean; busy: boolean; onToggle: () => void; onRemove: () => void; onDelete: () => void }) {
  const active = entry.assignment.isActive === true;
  return (
    <LibraryItemCard
      name={entry.name}
      imageUrl={entry.imageUrl}
      thumbnailUrl={entry.thumbnailUrl}
      noun="logo"
      scope={entry.scope}
      source={entry.source}
      badges={
        <>
          <LabelTag tone={active ? 'success' : 'neutral'} label={active ? 'Active' : 'Inactive'} />
          {shown ? <LabelTag tone="info" label="Guests see this one" /> : null}
          {!entry.stillInPartnerLibrary ? <LabelTag tone="warning" label="No longer in the partner library" /> : null}
          {!entry.itemActive ? <LabelTag tone="warning" label="Switched off in the library" /> : null}
        </>
      }
      actions={
        <>
          <SemanticButton action={active ? 'library:switch-off' : 'library:switch-on'} variant="secondary" size="xs" disabled={busy} onClick={onToggle}>
            {active ? 'Switch off' : 'Switch on'}
          </SemanticButton>
          <SemanticButton action="event-logos:remove" variant="danger" size="xs" disabled={busy} onClick={onRemove}>
            Remove logo
          </SemanticButton>
          {entry.scope === 'event' ? (
            <SemanticButton action="library:delete-upload" variant="danger" size="xs" disabled={busy} onClick={onDelete}>
              Delete upload
            </SemanticButton>
          ) : null}
        </>
      }
    />
  );
}
