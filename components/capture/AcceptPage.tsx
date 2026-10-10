'use client';

/**
 * Accept Page Component
 *
 * Displays consent/terms acceptance page with its checkboxes
 * Part of the custom event page flow system
 *
 * Why this component:
 * - GDPR compliance - tracks user consent with timestamp
 * - A required checkbox prevents progression without acceptance; every checkbox is required unless its page says otherwise
 * - Immutable record of what user agreed to
 *
 * Every checkbox has two settings (issue 558, lib/events/consent.ts): it is shown or not (a switched-off checkbox is not drawn and leaves no record) and required or optional (an optional one is marked
 * "(optional)", may stay unticked, and when it is left unticked the record says so). A checkbox that stores neither is drawn and behaves exactly as it always did.
 */

import { useState } from 'react';
import CaptureStageShell from '@/components/capture/CaptureStageShell';
import { Alert, Anchor, Button, Card, Checkbox, Group, Stack } from '@mantine/core';
import { consentCheckboxes, isRequiredCheckbox, shownCheckboxes, type ConsentCheckbox } from '@/lib/events/consent';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';
import { SELECTED_TINT } from '@/lib/theme/event-theme';
import { useT } from '@/components/i18n/UiLanguageProvider';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';

export interface AcceptPageConfig {
  title: string;
  description: string;
  checkboxText: string;
  /** A list of required checkboxes with an optional link each (camera#330); without it `checkboxText` is the one checkbox. */
  checkboxes?: ConsentCheckbox[];
  buttonText: string;
}

export interface AcceptPageData {
  accepted: boolean;
  acceptedAt: string;
  /** The checkboxes the user ticked, with their exact text and link, one consent record each. */
  items?: ConsentCheckbox[];
  /** The optional checkboxes that were shown and left unticked (issue 558): each leaves a record that says it was not ticked. */
  unticked?: ConsentCheckbox[];
}

export interface AcceptPageProps {
  config: AcceptPageConfig;
  pageId: string;
  onNext: (data: AcceptPageData) => void;
  onBack?: () => void;
  logoUrl?: string | null;
  brandColor?: string;
  brandBorderColor?: string;
  buttonSize?: EventButtonSize;
}

export default function AcceptPage({
  config,
  pageId,
  onNext,
  onBack,
  logoUrl,
  brandColor = CAMERA_DEFAULT_BRAND_COLOR,
  brandBorderColor = CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
}: AcceptPageProps) {
  const { t } = useT();
  const listed = consentCheckboxes(config);
  // A checkbox that is switched off is not shown and counts for nothing (issue 558).
  const items = listed.length > 0 ? shownCheckboxes(listed) : listed;
  const [checked, setChecked] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Every checkbox is required unless its page made it optional: the button works only when every required one is ticked. The older single text is one required checkbox.
  const accepted = listed.length > 0 ? items.every((item, index) => !isRequiredCheckbox(item) || checked[index] === true) : checked[0] === true;

  const handleNext = () => {
    if (!accepted) {
      setError(t('accept.mustAccept'));
      return;
    }

    // The records: what was ticked, and the optional checkboxes that were shown and left unticked (issue 558).
    const ticked = items.filter((_, index) => checked[index] === true);
    const unticked = items.filter((item, index) => checked[index] !== true && !isRequiredCheckbox(item));
    onNext({
      accepted: true,
      acceptedAt: new Date().toISOString(),
      ...(listed.length > 0 ? { items: ticked } : {}),
      ...(unticked.length > 0 ? { unticked } : {}),
    });
  };

  const handleCheckboxChange = (index: number, value: boolean) => {
    setChecked((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    if (value && error) {
      setError(null);
    }
  };

  const boxes: ConsentCheckbox[] = listed.length > 0 ? items : [{ text: config.checkboxText }];

  return (
    <CaptureStageShell
      title={config.title}
      description={config.description}
      logoUrl={logoUrl}
    >
      <Stack gap="sm">
        {boxes.map((item, index) => {
          const isChecked = checked[index] === true;
          const optional = !isRequiredCheckbox(item);
          return (
            <Card
              key={`${index}-${item.text}`}
              padding="md"
              radius="md"
              withBorder
              style={{
                borderColor: error && !isChecked && !optional
                  ? 'var(--mantine-color-red-5)'
                  : isChecked
                    ? `var(--event-button-bg, ${brandBorderColor})`
                    : 'var(--mantine-color-gray-3)',
                // A ticked box takes the event's button colour (the theme's), not a default blue; the tint is the one the theme's link colour is checked against.
                backgroundColor: isChecked ? `color-mix(in srgb, var(--event-button-bg, ${brandColor}) ${SELECTED_TINT * 100}%, var(--event-card-bg, transparent))` : undefined,
              }}
            >
              <Checkbox
                id={`accept-${pageId}-${index}`}
                checked={isChecked}
                onChange={(event) => handleCheckboxChange(index, event.currentTarget.checked)}
                label={
                  <>
                    {item.text}
                    {optional ? <span style={{ marginLeft: 6, opacity: 0.75 }}>{t('accept.optional')}</span> : null}
                    {item.linkUrl ? (
                      // The link opens the legal page in a new tab, so the user does not lose the flow; it sits beside the text so a tap on the text still ticks the box.
                      <Anchor
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('accept.newTab', { text: item.text })}
                        onClick={(event) => event.stopPropagation()}
                        ml={6}
                        fw={800}
                        td="underline"
                      >
                        ↗
                      </Anchor>
                    ) : null}
                  </>
                }
                aria-label={item.text}
                aria-invalid={Boolean(error) && !isChecked && !optional}
                aria-describedby={error ? 'accept-error' : undefined}
                styles={{
                  label: {
                    lineHeight: 1.6,
                  },
                }}
              />
            </Card>
          );
        })}

        {error ? (
          <Alert id="accept-error" role="alert">
            {error}
          </Alert>
        ) : null}
      </Stack>

      <Group grow>
        {onBack ? (
          <Button variant="light" size={buttonSize} onClick={onBack} aria-label={t('common.backAria')}>
            {t('common.back')}
          </Button>
        ) : null}
        <Button
          onClick={handleNext}
          disabled={!accepted}
          color={accepted ? brandColor : 'gray'}
          size={buttonSize}
          aria-label={config.buttonText}
          aria-disabled={!accepted}
        >
          {config.buttonText}
        </Button>
      </Group>
    </CaptureStageShell>
  );
}
