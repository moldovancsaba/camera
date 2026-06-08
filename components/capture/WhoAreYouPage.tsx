'use client';

/**
 * Who Are You Page Component
 *
 * Collects user information (name and email) before photo capture
 * Part of the custom event page flow system
 *
 * Why this component:
 * - GDPR-compliant data collection with user consent
 * - Validates required fields before allowing progression
 * - Stores data in submission for audit trail
 */

import { useState } from 'react';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import CaptureStageShell from '@/components/capture/CaptureStageShell';
import { Button, Divider, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';

export interface WhoAreYouPageConfig {
  title: string;
  description: string;
  nameLabel: string;
  emailLabel: string;
  buttonText: string;
  namePlaceholder?: string;
  emailPlaceholder?: string;
  enableSSOLogin?: boolean;
  enablePseudoReg?: boolean;
  ssoButtonText?: string;
  pseudoFormTitle?: string;
}

export interface WhoAreYouPageData {
  name: string;
  email: string;
}

export interface WhoAreYouPageProps {
  config: WhoAreYouPageConfig;
  onNext: (data: WhoAreYouPageData) => void;
  onBack?: () => void;
  logoUrl?: string | null;
  brandColor?: string;
  brandBorderColor?: string;
  eventId: string;
  pageIndex: number;
  buttonSize?: EventButtonSize;
}

export default function WhoAreYouPage({
  config,
  onNext,
  onBack,
  logoUrl,
  brandColor = CAMERA_DEFAULT_BRAND_COLOR,
  brandBorderColor = CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  eventId,
  pageIndex,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
}: WhoAreYouPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const enableSSOLogin = config.enableSSOLogin ?? false;
  const enablePseudoReg = config.enablePseudoReg ?? true;
  const socialHeading = config.ssoButtonText || 'Sign in with Google or Facebook';
  const pseudoFormTitle = config.pseudoFormTitle || 'Or enter your details';

  const beforeSocialNavigate = () => {
    document.cookie = `captureEventId=${eventId}; path=/; max-age=600; SameSite=Lax`;
    document.cookie = `capturePageIndex=${pageIndex}; path=/; max-age=600; SameSite=Lax`;
  };

  const validate = (): boolean => {
    const newErrors: { name?: string; email?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext({
        name: name.trim(),
        email: email.trim(),
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNext();
    }
  };

  return (
    <CaptureStageShell
      title={config.title}
      description={config.description}
      logoUrl={logoUrl}
      eyebrow="Capture flow"
    >
      {enableSSOLogin ? (
        <Stack gap="sm">
          <Text ta="center" size="sm" fw={600}>
            {socialHeading}
          </Text>
          <SocialLoginButtons variant="capture" beforeNavigate={beforeSocialNavigate} />
        </Stack>
      ) : null}

      {enableSSOLogin && enablePseudoReg ? <Divider label="OR" labelPosition="center" /> : null}

      {enablePseudoReg ? (
        <Stack gap="md">
          {enableSSOLogin ? (
            <Title order={3} ta="center">
              {pseudoFormTitle}
            </Title>
          ) : null}

          <TextInput
            label={config.nameLabel}
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value);
              if (errors.name) {
                setErrors((current) => ({ ...current, name: undefined }));
              }
            }}
            onKeyDown={handleKeyPress}
            placeholder={config.namePlaceholder || 'Enter your name'}
            aria-label={config.nameLabel}
            error={errors.name}
            styles={{
              input: !errors.name ? { borderColor: brandBorderColor } : undefined,
            }}
          />

          <TextInput
            label={config.emailLabel}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.currentTarget.value);
              if (errors.email) {
                setErrors((current) => ({ ...current, email: undefined }));
              }
            }}
            onKeyDown={handleKeyPress}
            placeholder={config.emailPlaceholder || 'your.email@example.com'}
            aria-label={config.emailLabel}
            error={errors.email}
            styles={{
              input: !errors.email ? { borderColor: brandBorderColor } : undefined,
            }}
          />

          <Group grow pt="xs">
            {onBack ? (
              <Button variant="light" size={buttonSize} onClick={onBack} aria-label="Go back to previous page">
                Back
              </Button>
            ) : null}
            <Button onClick={handleNext} color={brandColor} size={buttonSize} aria-label={config.buttonText}>
              {config.buttonText}
            </Button>
          </Group>
        </Stack>
      ) : null}
    </CaptureStageShell>
  );
}
