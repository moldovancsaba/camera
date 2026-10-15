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
import { journey } from '@/lib/journey/client';

export interface CTAPageConfig {
  title: string;
  description: string;
  checkboxText: string;
  buttonText: string;
  hasButton?: boolean;
  visitButtonText?: string;
  redirectingText?: string;
  /** A picture fitted into its own screen area, above the page's actions (camera#310, camera#491). */
  backgroundImageUrl?: string;
  /** Hide the title and description while keeping the title available to screen readers. */
  hideTexts?: boolean;
  /** Hide the URL and Continue controls together when another action keeps the page usable. */
  hideButtons?: boolean;
  /** Hide only the URL button; available only when the picture is linked and Continue is on. */
  hideVisitButton?: boolean;
  /** Make the whole picture a link to the configured URL (camera#491, lib/capture/cta-layout.ts). */
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
        journey.externalCtaOpened();
        setIsRedirecting(true);
        window.open(urlToVisit, '_blank');
      } else {
        journey.once('cta.click');
        journey.once('cta.action', 'external');
        window.location.href = urlToVisit;
      }
    } else if (hasButton) {
      journey.once('cta.click');
      journey.once('cta.action', 'continue');
      onNext({
        accepted: true,
        acceptedAt: new Date().toISOString(),
      });
    }
  };

  const handleContinue = () => {
    journey.once('cta.click');
    journey.once('cta.action', 'continue');
    onNext({
      accepted: true,
      acceptedAt: new Date().toISOString(),
    });
  };

  if (config.backgroundImageUrl) {
    const layout = ctaLayout({ url: config.checkboxText, hasButton, hideTexts: config.hideTexts, hideButtons: config.hideButtons, hideVisitButton: config.hideVisitButton, pictureLink: config.pictureLink });
    const pictureActionButtonStyle: CSSProperties = {
      width: 'min(80vw, 36rem)',
      height: '4.25rem',
      minHeight: '4.25rem',
      flex: 'none',
      boxSizing: 'border-box',
      padding: '0 1.5rem',
      fontSize: 'clamp(0.9rem, 2vw, 1.5rem)',
      letterSpacing: '0.08em',
      lineHeight: 1.1,
    };
    const handlePictureTap = () => {
      if (layout.pictureTap === 'visit-and-continue') {
        journey.externalCtaOpened();
        window.open(urlToVisit, '_blank', 'noopener');
        handleContinue();
      } else {
        handleRedirect();
      }
    };
    return (
      <FullScreenPage marker={{ 'data-cta-picture': '' }}>
        <div data-cta-picture-layout style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto auto', flex: '1 1 0', minHeight: 0, width: '100%' }}>
          <div data-cta-picture-art style={{ position: 'relative', gridRow: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* The grid reserves separate rows for copy and actions, so neither can overlap the fitted artwork. */}
            <Image src={config.backgroundImageUrl} alt="" fill unoptimized priority sizes="100vw" style={{ objectFit: 'contain', objectPosition: 'center' }} />
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
          </div>
          <div
            data-cta-picture-copy
            style={{ gridRow: 2, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: layout.showTexts ? '0.75rem 1rem' : 0, textAlign: 'center', color: `var(--event-heading, ${CAMERA_STAGE_WHITE})`, overflowY: 'auto' }}
          >
            <h1 style={layout.showTexts ? { margin: 0, maxWidth: '100%', fontSize: 'clamp(1.25rem, 4vw, 3rem)', fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase' } : VISUALLY_HIDDEN}>{config.title}</h1>
            {layout.showTexts && config.description ? <p style={{ margin: 0, maxWidth: '48rem', fontSize: 'clamp(1rem, 2vw, 1.5rem)', fontStyle: 'italic', lineHeight: 1.25 }}>{config.description}</p> : null}
          </div>
          {(layout.showVisitButton || layout.showContinueButton) ? (
            <div
              data-cta-picture-actions
              style={{ gridRow: 3, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', width: '100%', padding: '0.75rem max(1rem, env(safe-area-inset-right, 0px)) max(0.75rem, env(safe-area-inset-bottom, 0px)) max(1rem, env(safe-area-inset-left, 0px))', background: `var(--event-bg, ${CAMERA_STAGE_BLACK})` }}>
              {layout.showVisitButton ? (
                <PillButton onClick={handleRedirect} disabled={isRedirecting} fill={config.buttonColor} label={config.buttonTextColor} ring={config.buttonBorderColor} ariaLabel={t('cta.visitAria')} style={pictureActionButtonStyle}>
                  {isRedirecting ? opening : visitButtonText}
                </PillButton>
              ) : null}
              {layout.showContinueButton ? (
                <PillButton variant={urlToVisit ? 'outline' : 'solid'} onClick={handleContinue} fill={config.buttonColor} label={config.buttonTextColor} ring={config.buttonBorderColor} ariaLabel={config.buttonText} style={pictureActionButtonStyle}>
                  {config.buttonText}
                </PillButton>
              ) : null}
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
