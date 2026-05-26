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

import Image from 'next/image';
import { useState } from 'react';
import PublicShell from '@/components/gds/PublicShell';
import { Button, Card, Group, Stack, Text, Title } from '@/components/gds/ui';

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
  brandColor = '#9333EA',
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
    <PublicShell size="lg" centered>
      <Card padding="xl">
        <Stack gap="lg">
          {logoUrl ? (
            <Group justify="center">
              <Image
                src={logoUrl}
                alt="Event logo"
                width={320}
                height={128}
                unoptimized
                style={{ maxHeight: 128, maxWidth: 320, height: 'auto', width: 'auto' }}
              />
            </Group>
          ) : null}

          <Stack gap="xs" align="center">
            <Title order={1} ta="center">
              {config.title}
            </Title>
            {config.description ? (
              <Text c="dimmed" ta="center">
                {config.description}
              </Text>
            ) : null}
          </Stack>

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
              <Button variant="light" color="gray" onClick={onBack} aria-label="Go back to previous page">
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
        </Stack>
      </Card>
    </PublicShell>
  );
}
