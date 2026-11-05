'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { Anchor, Breadcrumbs, Button, Stack, Text } from '@/components/gds/PublicPrimitives';
import EventExperienceTemplateSettings from '@/components/admin/EventExperienceTemplateSettings';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { StateBlock } from '@sovereignsquad/gds-core/client';
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
  experienceTemplate?: { mode: 'inherit' | 'template'; templateId?: string | null } | null;
  effectiveExperienceTemplateId?: string | null;
  effectiveExperienceTemplateName?: string;
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

  const refreshEvent = async () => {
    try {
      setEvent(await readEvent(eventId));
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    }
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
      maxWidth="100%"
      breadcrumbs={(
        <Breadcrumbs>
          <Anchor component={Link} href="/admin/events" size="sm">Events</Anchor>
          <Anchor component={Link} href={`/admin/events/${eventId}`} size="sm">{event.name}</Anchor>
          <Text size="sm">{journeyTitle}</Text>
        </Breadcrumbs>
      )}
    >
      <EventExperienceTemplateSettings
        key={`${event.effectiveExperienceTemplateId ?? 'none'}:${event.experienceTemplate?.mode ?? 'legacy'}`}
        eventMongoId={eventId}
        sourceEventId={eventId}
        eventWelcomeScreenUrl={event.welcomeScreen?.url}
        eventTheme={event.theme}
        journeyContext={event.journeyContext}
        acceptanceOnWhoAreYou={typeof event.acceptanceOnWhoAreYou === 'boolean' ? event.acceptanceOnWhoAreYou : null}
        galleryConsent={typeof event.galleryConsent === 'boolean' ? event.galleryConsent : null}
        consentSettings={event.consentSettings ?? null}
        partnerCheckboxes={event.partnerCheckboxes}
        onSelectionChanged={refreshEvent}
      />
    </EditorScaffold>
  );
}
