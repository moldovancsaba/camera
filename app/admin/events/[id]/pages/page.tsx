'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { Anchor, Breadcrumbs, Button, Stack, Text } from '@/components/gds/PublicPrimitives';
import CustomPagesManager from '@/components/admin/CustomPagesManager';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { notifyAdminSuccess } from '@/components/admin/notify';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import type { CustomPage, FrameMessageSelectionDisplay } from '@/lib/db/schemas';
import type { JourneyContext } from '@/lib/events/journey';
import type { EffectiveCheckboxes, StoredCheckboxSettings } from '@/lib/events/checkbox-settings';
import { adminShellText } from '@/lib/i18n/admin-shell';

interface EventRecord {
  _id: string;
  name: string;
  customPages?: CustomPage[];
  welcomeScreen?: { url?: string } | null;
  theme?: { background?: string; font?: { family?: string } };
  journeyContext?: JourneyContext;
  acceptanceOnWhoAreYou?: boolean | null;
  galleryConsent?: boolean | null;
  consentSettings?: StoredCheckboxSettings | null;
  partnerCheckboxes?: EffectiveCheckboxes;
  frameMessageSelectionDisplay?: FrameMessageSelectionDisplay;
}

interface EventResponse {
  data?: { event?: EventRecord };
  event?: EventRecord;
  error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

async function readEvent(eventId: string): Promise<EventRecord> {
  const response = await fetch(`/api/events/${eventId}`);
  const payload: EventResponse = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to load event');
  const event = payload.data?.event || payload.event;
  if (!event) throw new Error('Event not found');
  return event;
}

export default function EventJourneyPagesPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const language = useUiLanguage();
  const journeyTitle = adminShellText('Event User Journey', language);
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void params.then(({ id }) => {
      if (active) setEventId(id);
    });
    return () => { active = false; };
  }, [params]);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    void readEvent(eventId)
      .then((loaded) => { if (active) setEvent(loaded); })
      .catch((loadError: unknown) => { if (active) setError(errorMessage(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId]);

  const savePages = async (pages: CustomPage[], options: {
    acceptanceOnWhoAreYou: boolean | null;
    galleryConsent: boolean | null;
    consentSettings: StoredCheckboxSettings | null;
    frameMessageSelectionDisplay: FrameMessageSelectionDisplay;
    defaultPageOrders?: Record<string, number>;
  }) => {
    const response = await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customPages: pages,
        acceptanceOnWhoAreYou: options.acceptanceOnWhoAreYou,
        galleryConsent: options.galleryConsent,
        consentSettings: options.consentSettings,
        frameMessageSelectionDisplay: options.frameMessageSelectionDisplay,
        ...(options.defaultPageOrders ? { defaultPageOrders: options.defaultPageOrders } : {}),
      }),
    });
    if (!response.ok) {
      let message = 'Failed to save pages';
      try {
        const result = await response.json();
        message = result.error || message;
      } catch {
        message = `Save failed (HTTP ${response.status})`;
      }
      throw new Error(message);
    }

    try {
      setEvent(await readEvent(eventId));
    } catch {
      // The update succeeded; a failed refresh should not report the save itself as failed.
    }
    notifyAdminSuccess({ title: 'Pages saved', message: 'Custom page flow updated successfully.' });
    router.refresh();
  };

  if (loading) return <StateBlock variant="loading" title="Loading event pages…" />;
  if (error || !event) {
    return (
      <Stack gap="lg" maw={960} mx="auto">
        <StateBlock
          variant="error"
          title="Could not load the user journey pages"
          description={error || 'Event not found'}
          action={<Button component={Link} href="/admin/events" variant="light">Back to Events</Button>}
        />
      </Stack>
    );
  }

  return (
    <EditorScaffold
      eyebrow="Events"
      title={`${event.name} — ${journeyTitle}`}
      description="Choose, edit and order the pages guests see for this event."
      breadcrumbs={(
        <Breadcrumbs>
          <Anchor component={Link} href="/admin/events" size="sm">Events</Anchor>
          <Anchor component={Link} href={`/admin/events/${eventId}`} size="sm">{event.name}</Anchor>
          <Text size="sm">{journeyTitle}</Text>
        </Breadcrumbs>
      )}
    >
      {error ? <InlineAlert title="Error" message={error} severity="error" /> : null}
      <CustomPagesManager
        key={event.customPages?.length ?? 0}
        eventId={eventId}
        eventWelcomeScreenUrl={event.welcomeScreen?.url}
        eventTheme={event.theme}
        initialPages={event.customPages || []}
        journeyContext={event.journeyContext}
        acceptanceOnWhoAreYou={typeof event.acceptanceOnWhoAreYou === 'boolean' ? event.acceptanceOnWhoAreYou : null}
        galleryConsent={typeof event.galleryConsent === 'boolean' ? event.galleryConsent : null}
        consentSettings={event.consentSettings ?? null}
        partnerCheckboxes={event.partnerCheckboxes}
        frameMessageSelectionDisplay={event.frameMessageSelectionDisplay}
        onSave={savePages}
      />
    </EditorScaffold>
  );
}
