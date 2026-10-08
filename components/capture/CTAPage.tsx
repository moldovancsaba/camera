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
import Image from 'next/image';
import FullScreenPage from '@/components/capture/FullScreenPage';
import PillButton from '@/components/capture/PillButton';
import CaptureStageShell from '@/components/capture/CaptureStageShell';
import { Button, Group, Stack, Text } from '@mantine/core';
import { CAMERA_DEFAULT_CTA_BRAND_COLOR, CAMERA_STAGE_BLACK, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';
import { redirectingText } from '@/lib/events/page-texts';

export interface CTAPageConfig {
  title: string;
  description: string;
  checkboxText: string;
  buttonText: string;
  hasButton?: boolean;
  visitButtonText?: string;
  redirectingText?: string;
  /** A picture that fills the screen behind the page's own title, text and buttons (camera#310). */
  backgroundImageUrl?: string;
  /** Colours of the round buttons on a page with a picture (hex). */
  buttonColor?: string;
  buttonTextColor?: string;
  buttonBorderColor?: string;
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
  buttonSize?: EventButtonSize;
  submissionId?: string;
}

export default function CTAPage({
  config,
  onNext,
  onBack,
  logoUrl,
  brandColor = CAMERA_DEFAULT_CTA_BRAND_COLOR,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
  submissionId,
}: CTAPageProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasButton = config.hasButton !== false;
  const urlToVisit = submissionId
    ? `${config.checkboxText}${config.checkboxText.includes('?') ? '&' : '?'}submissionId=${submissionId}`
    : config.checkboxText;
  const visitButtonText = config.visitButtonText || 'Visit Now';
  const opening = redirectingText(config.redirectingText);

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

  if (config.backgroundImageUrl) {
    const shadow = `0 0.1em 0.5em color-mix(in srgb, ${CAMERA_STAGE_BLACK} 55%, transparent)`;
    return (
      <FullScreenPage marker={{ 'data-cta-picture': '' }}>
        <Image src={config.backgroundImageUrl} alt="" fill unoptimized priority sizes="100vw" style={{ objectFit: 'cover', objectPosition: 'center' }} />
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, color-mix(in srgb, ${CAMERA_STAGE_BLACK} 55%, transparent), color-mix(in srgb, ${CAMERA_STAGE_BLACK} 25%, transparent))` }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', padding: '1.5rem', textAlign: 'center', color: CAMERA_STAGE_WHITE, overflowY: 'auto' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 7vw, 4.5rem)', fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase', textShadow: shadow }}>{config.title}</h1>
          {config.description ? <p style={{ margin: 0, maxWidth: '40rem', fontSize: 'clamp(1.05rem, 2.6vw, 1.75rem)', fontStyle: 'italic', textShadow: shadow }}>{config.description}</p> : null}
          {urlToVisit ? (
            <PillButton onClick={handleRedirect} disabled={isRedirecting} fill={config.buttonColor} label={config.buttonTextColor} ring={config.buttonBorderColor} ariaLabel="Visit URL">
              {isRedirecting ? opening : visitButtonText}
            </PillButton>
          ) : null}
          {hasButton ? (
            <PillButton variant={urlToVisit ? 'outline' : 'solid'} onClick={handleContinue} fill={config.buttonColor} label={config.buttonTextColor} ring={config.buttonBorderColor} ariaLabel={config.buttonText}>
              {config.buttonText}
            </PillButton>
          ) : null}
        </div>
      </FullScreenPage>
    );
  }

  return (
    <CaptureStageShell
      title={config.title}
      description={config.description}
      logoUrl={logoUrl}
    >
      {urlToVisit ? (
        <Stack gap="xs">
          <Button
            onClick={handleRedirect}
            disabled={isRedirecting}
            color={brandColor}
            size={buttonSize}
            fullWidth
            aria-label="Visit URL"
          >
            {isRedirecting ? `🔗 ${opening}` : `🔗 ${visitButtonText}`}
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
          <Button variant="light" size={buttonSize} onClick={onBack} aria-label="Go back to previous page">
            Back
          </Button>
        ) : null}
        {hasButton ? (
          <Button
            onClick={handleContinue}
            color={brandColor}
            size={buttonSize}
            aria-label={config.buttonText}
          >
            {config.buttonText}
          </Button>
        ) : null}
      </Group>
    </CaptureStageShell>
  );
}
