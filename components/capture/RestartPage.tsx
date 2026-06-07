'use client';

import CaptureStageShell from '@/components/capture/CaptureStageShell';
import { Button, Group } from '@/components/gds/PublicPrimitives';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';

export interface RestartPageConfig {
  title: string;
  description: string;
  buttonText: string;
  restartButtonText?: string;
}

export interface RestartPageProps {
  config: RestartPageConfig;
  onRestart: () => void;
  onBack?: () => void;
  logoUrl?: string | null;
  brandColor?: string;
  brandBorderColor?: string;
  buttonSize?: EventButtonSize;
}

export default function RestartPage({
  config,
  onRestart,
  onBack,
  logoUrl,
  brandColor = CAMERA_DEFAULT_BRAND_COLOR,
  brandBorderColor = CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
}: RestartPageProps) {
  void brandBorderColor;

  return (
    <CaptureStageShell
      title={config.title}
      description={config.description}
      logoUrl={logoUrl}
      eyebrow="Capture flow"
    >
      <Group grow>
        {onBack ? (
          <Button variant="light" size={buttonSize} onClick={onBack} aria-label="Go back to previous page">
            Back
          </Button>
        ) : null}
        <Button
          onClick={onRestart}
          color={brandColor}
          size={buttonSize}
          aria-label={config.restartButtonText || config.buttonText}
        >
          {config.restartButtonText || config.buttonText}
        </Button>
      </Group>
    </CaptureStageShell>
  );
}
