'use client';

/**
 * Accept Page Component
 *
 * Displays consent/terms acceptance page with required checkbox
 * Part of the custom event page flow system
 *
 * Why this component:
 * - GDPR compliance - tracks user consent with timestamp
 * - Required checkbox prevents progression without acceptance
 * - Immutable record of what user agreed to
 */

import { useState } from 'react';
import CaptureStageShell from '@/components/capture/CaptureStageShell';
import { Alert, Button, Card, Checkbox, Group, Stack } from '@mantine/core';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';

export interface AcceptPageConfig {
  title: string;
  description: string;
  checkboxText: string;
  buttonText: string;
}

export interface AcceptPageData {
  accepted: boolean;
  acceptedAt: string;
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
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    if (!accepted) {
      setError('You must accept to continue');
      return;
    }

    onNext({
      accepted: true,
      acceptedAt: new Date().toISOString(),
    });
  };

  const handleCheckboxChange = (checked: boolean) => {
    setAccepted(checked);
    if (checked && error) {
      setError(null);
    }
  };

  return (
    <CaptureStageShell
      title={config.title}
      description={config.description}
      logoUrl={logoUrl}
      eyebrow="Capture flow"
    >
      <Stack gap="sm">
        <Card
          padding="md"
          radius="md"
          withBorder
          style={{
            borderColor: error
              ? 'var(--mantine-color-red-5)'
              : accepted
                ? brandBorderColor
                : 'var(--mantine-color-gray-3)',
            backgroundColor: accepted ? `${brandColor}10` : undefined,
          }}
        >
          <Checkbox
            id={`accept-${pageId}`}
            checked={accepted}
            onChange={(event) => handleCheckboxChange(event.currentTarget.checked)}
            label={config.checkboxText}
            aria-label="Accept terms"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'accept-error' : undefined}
            styles={{
              label: {
                lineHeight: 1.6,
              },
            }}
          />
        </Card>

        {error ? (
          <Alert id="accept-error" role="alert">
            {error}
          </Alert>
        ) : null}
      </Stack>

      <Group grow>
        {onBack ? (
          <Button variant="light" size={buttonSize} onClick={onBack} aria-label="Go back to previous page">
            Back
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
