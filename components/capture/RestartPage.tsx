'use client';

import CaptureStageShell from '@/components/capture/CaptureStageShell';
import { Button, Group } from '@mantine/core';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';
import { useT } from '@/components/i18n/UiLanguageProvider';

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
  preview?: boolean;
}

export default function RestartPage({
  config,
  onRestart,
  onBack,
  logoUrl,
  brandColor = CAMERA_DEFAULT_BRAND_COLOR,
  brandBorderColor = CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
  preview = false,
}: RestartPageProps) {
  const { t, own } = useT();
  void brandBorderColor;
  const title = own('approval.title', config.title);
  const restartText = own('welcome.button', config.restartButtonText || config.buttonText);

  return (
    <CaptureStageShell
      title={title}
      description={config.description}
      logoUrl={logoUrl}
      preview={preview}
    >
      <Group grow>
        {onBack ? (
          <Button variant="light" size={buttonSize} onClick={onBack} aria-label={t('common.backAria')}>
            {t('common.back')}
          </Button>
        ) : null}
        <Button
          onClick={onRestart}
          color={brandColor}
          size={buttonSize}
          aria-label={restartText}
        >
          {restartText}
        </Button>
      </Group>
    </CaptureStageShell>
  );
}
