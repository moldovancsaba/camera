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
import { Anchor, Box, Button, Checkbox, Divider, Group, Stack, TextInput, Title } from '@mantine/core';
import type { SentencePart } from '@/lib/events/acceptance';
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

/**
 * The consent page shown as one checkbox with one sentence on this page (issue 523; client feedback 2026-10-09). Everything on the page is off until it is ticked. The page that owns the
 * flow records the acceptance when it is given (a sign-in leaves the page), so the box only reports the tick. Required is the standard; an event that made it optional (issue 558) has a page that works
 * without the tick and marks the sentence "(optional)".
 */
export interface WhoAreYouAcceptance {
  sentence: SentencePart[];
  /** False when the event made the acceptance optional: nothing waits for the tick. Missing or true: everything waits for it, as it always did. */
  required?: boolean;
  /** Ticked already (the user came back to this page after accepting). */
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export interface WhoAreYouPageProps {
  config: WhoAreYouPageConfig;
  /** Present when the event shows its acceptance here instead of on a page of its own. */
  acceptance?: WhoAreYouAcceptance;
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
  acceptance,
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
  // With the acceptance on this page nothing works until its box is ticked.
  const [accepted, setAccepted] = useState(acceptance?.checked === true);
  const acceptanceRequired = acceptance?.required !== false;
  const locked = acceptance !== undefined && acceptanceRequired && !accepted;

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
    if (locked) return;
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
      {acceptance ? (
        <Box p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }} data-acceptance>
          <Checkbox
            size="xs"
            checked={accepted}
            onChange={(event) => {
              setAccepted(event.currentTarget.checked);
              acceptance.onChange(event.currentTarget.checked);
            }}
            {...(acceptanceRequired ? { 'aria-required': true } : {})}
            label={
              <span style={{ fontSize: '0.75rem', lineHeight: 1.35 }}>
                {acceptance.sentence.map((part, index) =>
                  part.linkUrl ? (
                    // A link opens its page in a new tab, so the user does not lose the flow; a tap on it does not tick the box.
                    <Anchor key={index} href={part.linkUrl} target="_blank" rel="noopener noreferrer" fw={700} td="underline" inherit onClick={(event) => event.stopPropagation()}>
                      {part.text}
                    </Anchor>
                  ) : (
                    <span key={index}>{part.text}</span>
                  )
                )}
                {acceptanceRequired ? null : <span style={{ marginLeft: 6, opacity: 0.75 }}>{t('accept.optional')}</span>}
              </span>
            }
          />
        </Box>
      ) : null}

      {enableSSOLogin ? (
        <Stack gap="xs">
          <Title order={4} ta="center">
            {socialHeading}
          </Title>
          <SocialLoginButtons captureEventId={eventId} capturePage={pageIndex} disabled={locked} />
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
            disabled={locked}
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
            disabled={locked}
            aria-label={emailLabel}
            error={errors.email}
          />

          <Group grow pt="xs">
            {onBack ? (
              <Button variant="light" size={buttonSize} onClick={onBack} aria-label={t('common.backAria')}>
                {t('common.back')}
              </Button>
            ) : null}
            <Button onClick={handleNext} color={brandColor} size={buttonSize} aria-label={buttonText} disabled={locked}>
              {buttonText}
            </Button>
          </Group>
        </Stack>
      ) : null}
    </CaptureStageShell>
  );
}
