'use client';

import { useState } from 'react';
import CustomPagesManager from '@/components/admin/CustomPagesManager';
import type { CustomPage, FrameMessageSelectionDisplay } from '@/lib/db/schemas';
import type { JourneyContext } from '@/lib/events/journey';
import type { EffectiveCheckboxes, StoredCheckboxSettings } from '@/lib/events/checkbox-settings';
import type { PickerLevel } from '@/lib/library/picker';
import type { ExperienceTemplate } from '@/lib/visual-assets/contracts';

interface Props {
  template: ExperienceTemplate;
  pickerLevel: PickerLevel;
  eventId?: string;
  eventWelcomeScreenUrl?: string;
  eventTheme?: { background?: string; font?: { family?: string } };
  journeyContext?: JourneyContext;
  acceptanceOnWhoAreYou?: boolean | null;
  galleryConsent?: boolean | null;
  consentSettings?: StoredCheckboxSettings | null;
  partnerCheckboxes?: EffectiveCheckboxes;
  onSaved: (template: ExperienceTemplate) => void;
}

function toCustomPages(value: unknown): CustomPage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((page): page is CustomPage => Boolean(
    page && typeof page === 'object' && !Array.isArray(page)
    && typeof (page as CustomPage).pageId === 'string'
    && typeof (page as CustomPage).pageType === 'string'
    && typeof (page as CustomPage).order === 'number'
    && (page as CustomPage).config && typeof (page as CustomPage).config === 'object',
  ));
}

/** The one full journey editor used for Global, Partner and Event-owned versions. */
export default function ExperienceTemplatePageEditor({
  template,
  pickerLevel,
  eventId,
  eventWelcomeScreenUrl,
  eventTheme,
  journeyContext,
  acceptanceOnWhoAreYou,
  galleryConsent,
  consentSettings,
  partnerCheckboxes,
  onSaved,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const pages = toCustomPages(template.config.customPages);
  const title = template.level === 'global' ? 'Global User Journey' : template.level === 'partner' ? 'Partner User Journey' : 'Event User Journey';
  // A parent journey describes the reusable flow, including where event-owned
  // consent and identity steps belong. Those steps are generated from each
  // event's own policy at runtime; the editor uses the broadest standard flow
  // so their position can still be set at Global or Partner level.
  const effectiveJourneyContext: JourneyContext = journeyContext ?? {
    vettingRequired: true,
    consentDefault: true,
    language: 'en',
    hasWelcomeScreen: true,
    defaultOrders: template.config.defaultPageOrders as Record<string, number> | undefined,
  };

  const save = async (
    nextPages: CustomPage[],
    options: {
      frameMessageSelectionDisplay: FrameMessageSelectionDisplay;
      defaultPageOrders?: Record<string, number>;
    },
  ) => {
    setError(null);
    const config = {
      ...template.config,
      customPages: nextPages,
      frameMessageSelectionDisplay: options.frameMessageSelectionDisplay,
      ...(options.defaultPageOrders ? { defaultPageOrders: options.defaultPageOrders } : {}),
    };
    const response = await fetch(`/api/visual-assets/templates/${encodeURIComponent(template.templateId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    const payload = await response.json().catch(() => null) as { data?: { template?: ExperienceTemplate | null }; error?: string } | null;
    if (!response.ok || !payload?.data?.template) {
      const message = payload?.error || `Request failed (${response.status})`;
      setError(message);
      throw new Error(message);
    }
    onSaved(payload.data.template);
  };

  return (
    <>
      {error ? <p role="alert" style={{ color: 'var(--mantine-color-error)' }}>{error}</p> : null}
      <CustomPagesManager
        key={template.templateId}
        eventId={eventId}
        pickerLevel={pickerLevel}
        journeyTitle={`${title}: ${template.name}`}
        allowConsentPages={template.level === 'event'}
        allowEditingEventSpecificDefaults={template.level === 'event'}
        parentJourney={template.level !== 'event'}
        allowConsentSettings={false}
        initialDefaultPageOrders={template.config.defaultPageOrders as Record<string, number> | undefined}
        eventWelcomeScreenUrl={eventWelcomeScreenUrl}
        eventTheme={eventTheme}
        initialPages={pages}
        journeyContext={effectiveJourneyContext}
        acceptanceOnWhoAreYou={acceptanceOnWhoAreYou}
        galleryConsent={galleryConsent}
        consentSettings={consentSettings}
        partnerCheckboxes={partnerCheckboxes}
        frameMessageSelectionDisplay={template.config.frameMessageSelectionDisplay as FrameMessageSelectionDisplay | undefined}
        onSave={(nextPages, options) => save(nextPages, options)}
      />
    </>
  );
}
