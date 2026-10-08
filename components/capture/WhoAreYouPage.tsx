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
import { loginOptions } from '@/lib/events/identity-page';
import { useT } from '@/components/i18n/UiLanguageProvider';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import CaptureStageShell from '@/components/capture/CaptureStageShell';
import { Button, Divider, Group, Stack, TextInput, Title } from '@mantine/core';
import {
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
  eventId,
  pageIndex,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
}: WhoAreYouPageProps) {
  const { t, own } = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  // At least one way to say who you are stays on (planning item 36); an empty text falls back to its default.
  const { sso: enableSSOLogin, form: enablePseudoReg } = loginOptions(config);
  // Every text: the editor's own, else the language's default; a stored English default counts as not set in another language (camera#352).
  const nameLabel = own(['login.nameLabel', 'login.nameLabelEditor'], config.nameLabel);
  const emailLabel = own(['login.emailLabel', 'login.emailLabelEditor'], config.emailLabel);
  const buttonText = own('login.button', config.buttonText);
  const socialHeading = own(['login.ssoEditor', 'login.sso'], config.ssoButtonText);
  const pseudoFormTitle = own(['login.formEditor', 'login.form'], config.pseudoFormTitle);

  const validate = (): boolean => {
    const newErrors: { name?: string; email?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('login.err.nameRequired');
    } else if (name.trim().length < 2) {
      newErrors.name = t('login.err.nameShort');
    }

    if (!email.trim()) {
      newErrors.email = t('login.err.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = t('login.err.emailInvalid');
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
      title={own('login.title', config.title)}
      description={own('login.description', config.description)}
      logoUrl={logoUrl}
    >
      {enableSSOLogin ? (
        <Stack gap="xs">
          <Title order={4} ta="center">
            {socialHeading}
          </Title>
          <SocialLoginButtons captureEventId={eventId} capturePage={pageIndex} />
        </Stack>
      ) : null}

      {enableSSOLogin && enablePseudoReg ? <Divider label={t('login.or')} labelPosition="center" /> : null}

      {enablePseudoReg ? (
        <Stack gap="sm">
          {enableSSOLogin ? (
            <Title order={4} ta="center">
              {pseudoFormTitle}
            </Title>
          ) : null}

          <TextInput
            size="sm"
            label={nameLabel}
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value);
              if (errors.name) {
                setErrors((current) => ({ ...current, name: undefined }));
              }
            }}
            onKeyDown={handleKeyPress}
            placeholder={own(['login.namePlaceholderEditor', 'login.namePlaceholder'], config.namePlaceholder)}
            aria-label={nameLabel}
            error={errors.name}
          />

          <TextInput
            size="sm"
            label={emailLabel}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.currentTarget.value);
              if (errors.email) {
                setErrors((current) => ({ ...current, email: undefined }));
              }
            }}
            onKeyDown={handleKeyPress}
            placeholder={own(['login.emailPlaceholderEditor', 'login.emailPlaceholder'], config.emailPlaceholder)}
            aria-label={emailLabel}
            error={errors.email}
          />

          <Group grow pt="xs">
            {onBack ? (
              <Button variant="light" size={buttonSize} onClick={onBack} aria-label={t('common.backAria')}>
                {t('common.back')}
              </Button>
            ) : null}
            <Button onClick={handleNext} color={brandColor} size={buttonSize} aria-label={buttonText}>
              {buttonText}
            </Button>
          </Group>
        </Stack>
      ) : null}
    </CaptureStageShell>
  );
}
