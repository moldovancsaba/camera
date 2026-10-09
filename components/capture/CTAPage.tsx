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

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import FullScreenPage from '@/components/capture/FullScreenPage';
import PillButton from '@/components/capture/PillButton';
import CaptureStageShell from '@/components/capture/CaptureStageShell';
import { Button, Group, Stack, Text } from '@mantine/core';
import { CAMERA_DEFAULT_CTA_BRAND_COLOR, CAMERA_STAGE_BLACK, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';
import { redirectingText } from '@/lib/events/page-texts';
import { ctaLayout } from '@/lib/capture/cta-layout';
import { useT, useUiTexts } from '@/components/i18n/UiLanguageProvider';

export interface CTAPageConfig {
  title: string;
  description: string;
  checkboxText: string;
  buttonText: string;
  hasButton?: boolean;
  visitButtonText?: string;
  redirectingText?: string;
  /** A picture that fits the screen behind the page's own title, text and buttons (camera#310, camera#491). */
  backgroundImageUrl?: string;
  /** Hide the title and the text (a screen reader still gets the title), the buttons, and make the whole picture a link (camera#491, lib/capture/cta-layout.ts). */
  hideTexts?: boolean;
  hideButtons?: boolean;
  pictureLink?: boolean;
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

/** A heading the page keeps for screen readers when its text is hidden. */
const VISUALLY_HIDDEN: CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

export default function CTAPage({
  config,
  onNext,
  onBack,
  logoUrl,
  brandColor = CAMERA_DEFAULT_CTA_BRAND_COLOR,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
  submissionId,
}: CTAPageProps) {
  const { t, own, language } = useT();
  const texts = useUiTexts();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasButton = config.hasButton !== false;
  // No address, no link: without this a page with no address but a photo id would link to "?submissionId=…".
  const urlToVisit = !config.checkboxText
    ? ''
    : submissionId
      ? `${config.checkboxText}${config.checkboxText.includes('?') ? '&' : '?'}submissionId=${submissionId}`
      : config.checkboxText;
  const visitButtonText = own('cta.visitDefault', config.visitButtonText);
  const opening = redirectingText(config.redirectingText, language, texts);

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
    const layout = ctaLayout({ url: config.checkboxText, hasButton, hideTexts: config.hideTexts, hideButtons: config.hideButtons, pictureLink: config.pictureLink });
    const shadow = `0 0.1em 0.5em color-mix(in srgb, ${CAMERA_STAGE_BLACK} 55%, transparent)`;
    // The darkening behind the writing is only there when there is writing.
    const hasWriting = layout.showTexts || layout.showVisitButton || layout.showContinueButton;
    const handlePictureTap = () => {
      if (layout.pictureTap === 'visit-and-continue') {
        window.open(urlToVisit, '_blank', 'noopener');
        handleContinue();
      } else {
        handleRedirect();
      }
    };
    return (
      <FullScreenPage marker={{ 'data-cta-picture': '' }}>
        {/* The whole picture is visible, whatever the screen: it fits the page and keeps its shape (the page colour of the event shows around it). */}
        <Image src={config.backgroundImageUrl} alt="" fill unoptimized priority sizes="100vw" style={{ objectFit: 'contain', objectPosition: 'center' }} />
        {hasWriting ? (
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, color-mix(in srgb, ${CAMERA_STAGE_BLACK} 55%, transparent), color-mix(in srgb, ${CAMERA_STAGE_BLACK} 25%, transparent))` }} />
        ) : null}
        {layout.pictureLink ? (
          <button
            type="button"
            data-cta-picture-link
            onClick={handlePictureTap}
            disabled={isRedirecting}
            aria-label={visitButtonText || config.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
          />
        ) : null}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', padding: '1.5rem', textAlign: 'center', color: CAMERA_STAGE_WHITE, overflowY: 'auto', pointerEvents: 'none' }}>
          <h1 style={layout.showTexts ? { margin: 0, fontSize: 'clamp(2rem, 7vw, 4.5rem)', fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase', textShadow: shadow } : VISUALLY_HIDDEN}>{config.title}</h1>
          {layout.showTexts && config.description ? <p style={{ margin: 0, maxWidth: '40rem', fontSize: 'clamp(1.05rem, 2.6vw, 1.75rem)', fontStyle: 'italic', textShadow: shadow }}>{config.description}</p> : null}
          {layout.showVisitButton ? (
            <div style={{ pointerEvents: 'auto' }}>
              <PillButton onClick={handleRedirect} disabled={isRedirecting} fill={config.buttonColor} label={config.buttonTextColor} ring={config.buttonBorderColor} ariaLabel={t('cta.visitAria')}>
                {isRedirecting ? opening : visitButtonText}
              </PillButton>
            </div>
          ) : null}
          {layout.showContinueButton ? (
            <div style={{ pointerEvents: 'auto' }}>
              <PillButton variant={urlToVisit ? 'outline' : 'solid'} onClick={handleContinue} fill={config.buttonColor} label={config.buttonTextColor} ring={config.buttonBorderColor} ariaLabel={config.buttonText}>
                {config.buttonText}
              </PillButton>
            </div>
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
            aria-label={t('cta.visitAria')}
          >
            {isRedirecting ? `🔗 ${opening}` : `🔗 ${visitButtonText}`}
          </Button>
          {hasButton ? (
            <Text size="xs" ta="center" c="dimmed">
              {t('cta.newTab')}
            </Text>
          ) : null}
        </Stack>
      ) : null}

      <Group grow>
        {onBack && hasButton ? (
          <Button variant="light" size={buttonSize} onClick={onBack} aria-label={t('common.backAria')}>
            {t('common.back')}
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
