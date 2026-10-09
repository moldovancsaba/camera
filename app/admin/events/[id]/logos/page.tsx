'use client';

/**
 * The logos of one event (camera#419, docs/BUILDING_BRICKS.md; owner, 2026-10-09). The logo is chosen at the place of use, the default by default:
 * the event's logo is used on every page and screen of the event unless a place below has its own, and the event's logo itself is the partner's unless the event
 * chooses. At each place: use the default, pick one from the partner's library, upload a new one, replace the default, add more, or show nothing. One logo is
 * used as it is; several are picked at random. The library never says where a logo shows.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { GdsStack, InlineAlert, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import SlotPanel, { type SlotItem } from '@/components/admin/kit/SlotPanel';
import type { SlotMode, SlotValue } from '@/lib/slots/resolve';

interface Payload<T> {
  data?: T;
  error?: string;
}

interface PanelData {
  slotId: string;
  value: SlotValue;
  mode: SlotMode;
  defaultItems: SlotItem[];
  ownItems: SlotItem[];
  effective: SlotItem[];
}

interface Panels {
  onModel: boolean;
  partner: { partnerId: string; adminId: string; name: string } | null;
  slots: PanelData[];
  candidates: Array<SlotItem & { scope: string }>;
}

const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';
/** The places of use that have a screen, with the words the editor sees (the slideshow transition has no screen yet). */
const PLACES = [
  { slotId: 'logo-pages', title: 'On the pages of the user journey', description: 'At the top of the welcome, consent, login and other pages.' },
  { slotId: 'logo-capture-loading', title: 'While the capture app loads', description: 'The screen a user sees before the event page is ready.' },
  { slotId: 'logo-slideshow-loading', title: 'While the slideshow loads', description: 'The screen the slideshow shows before the first photo.' },
] as const;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : 'An unexpected error occurred');

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data;
}

export default function EventLogosPage({ params }: { params: Promise<{ id: string }> }) {
  const [eventId, setEventId] = useState('');
  const [eventName, setEventName] = useState<string | null>(null);
  const [panels, setPanels] = useState<Panels | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    params.then((resolved) => setEventId(resolved.id));
  }, [params]);

  const reload = useCallback(async () => {
    if (eventId) setPanels(await call<Panels>(`/api/events/${eventId}/logo-slots`));
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

  const choose = async (slotId: string, value: SlotValue) => {
    setBusy(true);
    setActionError(null);
    try {
      const saved = await call<{ panels: Panels }>(`/api/events/${eventId}/logo-slots`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, value }),
      });
      setPanels(saved.panels);
    } catch (failure) {
      setActionError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const keepLost = async (id: string) => {
    setBusy(true);
    setActionError(null);
    try {
      const kept = await call<{ panels: Panels }>(`/api/events/${eventId}/logo-slots/keep`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      setPanels(kept.panels);
    } catch (failure) {
      setActionError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const deleteUpload = async (logoId: string, name: string) => {
    if (!confirm(`Delete "${name}"? It was uploaded for this event and is removed for good, from every place that uses it.`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await call(`/api/events/${eventId}/library/items/${logoId}?kind=logos`, { method: 'DELETE' });
      await reload();
    } catch (failure) {
      setActionError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <StateBlock variant="loading" title="Loading logos..." />;
  if (error || !panels) {
    return (
      <GdsStack gap="md">
        <InlineAlert title="Error" message={error || 'Could not load the logos'} severity="error" />
        <Link href="/admin/events">← Back to Events</Link>
      </GdsStack>
    );
  }

  const panelOf = (slotId: string) => panels.slots.find((panel) => panel.slotId === slotId);
  const partnerName = panels.partner ? 'the partner' : null;
  const uploads = panels.candidates.filter((item) => item.scope === 'event');
  const upload = (slotId: string) => ({ endpoint: `/api/events/${eventId}/library/upload`, extraFields: { slot: slotId }, accept: ACCEPT, acceptWords: 'PNG, JPG, SVG or WebP', maxBytes: 4 * 1024 * 1024, maxWords: '4 MB' });

  const render = (slotId: string, title: string, description: string, parentName: string | null) => {
    const panel = panelOf(slotId);
    if (!panel) return null;
    return (
      <SlotPanel
        key={slotId}
        title={title}
        description={description}
        noun="logo"
        parentName={parentName}
        value={panel.value}
        mode={panel.mode}
        defaultItems={panel.defaultItems}
        effective={panel.effective}
        candidates={panels.candidates}
        busy={busy}
        error={actionError}
        onChange={(value) => choose(slotId, value)}
        upload={upload(slotId)}
        onUploaded={reload}
        onKeepLost={keepLost}
      />
    );
  };

  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/events">Events</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/events/${eventId}`}>{eventName}</Link>
        <span aria-hidden> / </span>
        <span>Logos</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Events"
        title={`Logos: ${eventName}`}
        description={
          panels.partner
            ? `The logo of this event is the logo of ${panels.partner.name} unless you choose another here. Each place below uses the event's logo unless you choose another there.`
            : 'This event has no partner, so it uses only the logos you choose here.'
        }
        primaryAction={panels.partner ? { href: `/admin/partners/${panels.partner.adminId}/logos`, label: "The partner's logos" } : undefined}
      />

      {panels.onModel ? null : (
        <InlineAlert
          title="This event still has its logos as they were"
          message="What is shown below is what the event shows today. The first change you save moves it to the new way of choosing, and keeps everything it shows now."
          severity="info"
        />
      )}

      {render('logo', 'The logo of this event', 'Used on every page and screen of the event unless a place below has its own.', partnerName)}

      <SectionPanel title="Places of use" description="Each place uses the event's logo unless you choose another one for that place only.">
        <GdsStack gap="md">{PLACES.map((place) => render(place.slotId, place.title, place.description, 'the event'))}</GdsStack>
      </SectionPanel>

      {uploads.length > 0 ? (
        <SectionPanel title="Uploaded for this event" description="Logos only this event can use. Deleting one takes it out of every place that uses it.">
          <GdsStack gap="sm">
            {uploads.map((item) => (
              <div key={item.id} style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
                <span>{item.name}</span>
                <SemanticButton action="library:delete-upload" variant="danger" size="xs" disabled={busy} onClick={() => void deleteUpload(item.id, item.name)}>
                  Delete upload
                </SemanticButton>
              </div>
            ))}
          </GdsStack>
        </SectionPanel>
      ) : null}
    </GdsStack>
  );
}
