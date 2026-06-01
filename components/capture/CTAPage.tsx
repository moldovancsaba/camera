'use client';

/**
 * CTA (Call To Action) Page Component
 *
 * Displays call-to-action page that can redirect to a URL
 * Part of the custom event page flow system
 *
 * CTA behavior (custom page flow):
 * - checkboxText repurposed as URL to visit
 * - Button is optional (hasButton config)
 * - If hasButton=false, this becomes an end page that auto-redirects
 *
 * Why separate from AcceptPage:
 * - Semantic difference: CTA is for marketing/engagement, Accept is for legal consent
 * - Different analytics tracking (acceptance rates for CTAs vs consents)
 * - May have different styling/prominence in future
 */

import { useState } from 'react';
import CaptureStageShell from '@/components/capture/CaptureStageShell';
import { Button, Group, Stack, Text } from '@mantine/core';
import { CAMERA_DEFAULT_CTA_BRAND_COLOR } from '@/lib/gds/tokens/colors';

export interface CTAPageConfig {
  title: string;
  description: string;
  checkboxText: string;
  buttonText: string;
  hasButton?: boolean;
  visitButtonText?: string;
  redirectingText?: string;
}

export interface CTAPageData {
  accepted: boolean;
  acceptedAt: string;
}

export interface CTAPageProps {
  config: CTAPageConfig;
  pageId: string;
  onNext: (data: CTAPageData) => void;
  onBack?: () => void;
  logoUrl?: string | null;
  brandColor?: string;
  brandBorderColor?: string;
}

export default function CTAPage({
  config,
  onNext,
  onBack,
  logoUrl,
  brandColor = CAMERA_DEFAULT_CTA_BRAND_COLOR,
}: CTAPageProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasButton = config.hasButton !== false;
  const urlToVisit = config.checkboxText;
  const visitButtonText = config.visitButtonText || 'Visit Now';
  void config.redirectingText;

  const handleRedirect = () => {
    if (urlToVisit) {
      if (hasButton) {
        setIsRedirecting(true);
        window.open(urlToVisit, '_blank');
      } else {
        window.location.href = urlToVisit;
      }
    } else if (hasButton) {
      onNext({
        accepted: true,
        acceptedAt: new Date().toISOString(),
      });
    }
  };

  const handleContinue = () => {
    onNext({
      accepted: true,
      acceptedAt: new Date().toISOString(),
    });
  };

  return (
    <CaptureStageShell
      title={config.title}
      description={config.description}
      logoUrl={logoUrl}
      eyebrow="Capture flow"
    >
      {urlToVisit ? (
        <Stack gap="xs">
          <Button
            onClick={handleRedirect}
            disabled={isRedirecting}
            color={brandColor}
            size="lg"
            fullWidth
            aria-label="Visit URL"
          >
            {isRedirecting ? '🔗 Opening...' : `🔗 ${visitButtonText}`}
          </Button>
          {hasButton ? (
            <Text size="xs" ta="center" c="dimmed">
              Opens in a new tab
            </Text>
          ) : null}
        </Stack>
      ) : null}

      <Group grow>
        {onBack && hasButton ? (
          <Button variant="light" onClick={onBack} aria-label="Go back to previous page">
            Back
          </Button>
        ) : null}
        {hasButton ? (
          <Button
            onClick={handleContinue}
            color={brandColor}
            aria-label={config.buttonText}
          >
            {config.buttonText}
          </Button>
        ) : null}
      </Group>
    </CaptureStageShell>
  );
}
