'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { Anchor, Breadcrumbs, Button, Stack, Text } from '@/components/gds/PublicPrimitives';
import CustomPagesManager from '@/components/admin/CustomPagesManager';
import EventExperienceTemplateSettings from '@/components/admin/EventExperienceTemplateSettings';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { notifyAdminSuccess } from '@/components/admin/notify';
import { GdsInline, InlineAlert, MetadataText, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
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
  const router = useRouter();
  const language = useUiLanguage();
  const journeyTitle = adminShellText('Event User Journey', language);
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journeyVersionName, setJourneyVersionName] = useState('');
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    setJourneyVersionName(event?.effectiveExperienceTemplateName ?? '');
  }, [event?.effectiveExperienceTemplateId, event?.effectiveExperienceTemplateName]);

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

  const renameJourney = async () => {
    if (!event?.effectiveExperienceTemplateId || !journeyVersionName.trim()) return;
    setRenaming(true);
    setError(null);
    try {
      const response = await fetch(`/api/visual-assets/templates/${encodeURIComponent(event.effectiveExperienceTemplateId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: journeyVersionName.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `Rename failed (HTTP ${response.status})`);
      setEvent((current) => current ? { ...current, effectiveExperienceTemplateName: journeyVersionName.trim() } : current);
      notifyAdminSuccess({ title: 'Journey renamed', message: 'The event journey is now an independent version.' });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setRenaming(false);
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
      breadcrumbs={(
        <Breadcrumbs>
          <Anchor component={Link} href="/admin/events" size="sm">Events</Anchor>
          <Anchor component={Link} href={`/admin/events/${eventId}`} size="sm">{event.name}</Anchor>
          <Text size="sm">{journeyTitle}</Text>
        </Breadcrumbs>
      )}
    >
      {error ? <InlineAlert title="Error" message={error} severity="error" /> : null}
      <EventExperienceTemplateSettings
        key={`${event.effectiveExperienceTemplateId ?? 'none'}:${event.experienceTemplate?.mode ?? 'legacy'}`}
        eventMongoId={eventId}
        sourceEventId={eventId}
      />
      <SectionPanel title="Journey version" description="Inherited journeys follow global and partner defaults. The first event-level edit creates an independent version that later parent changes will not overwrite.">
        {event.experienceTemplate?.mode === 'template' && event.effectiveExperienceTemplateId ? (
          <GdsInline gap="md" align="end">
            <AdminTextInput name="event-journey-version-name" label="Event journey name" value={journeyVersionName} onChange={setJourneyVersionName} maxLength={120} />
            <SemanticButton action="event-journey:rename-version" loading={renaming} disabled={renaming || !journeyVersionName.trim() || journeyVersionName.trim() === event.effectiveExperienceTemplateName} onClick={() => void renameJourney()}>
              Rename journey
            </SemanticButton>
          </GdsInline>
        ) : (
          <MetadataText>This event follows its inherited journey. Saving a change here will create a separate, named event version.</MetadataText>
        )}
      </SectionPanel>
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
