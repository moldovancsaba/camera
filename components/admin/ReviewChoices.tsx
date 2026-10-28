'use client';

/**
 * The text choice buttons of the vetting screens (issue 628, owner answers 454 and 455: plain words, no emoji): a group of toggle buttons that read their words from the event's vocabulary,
 * and the "Why is it rejected?" picker the one-at-a-time screen and the list of cards share. Every choice is a real button with `aria-pressed`, so it works with a finger, a mouse and the
 * keyboard, and a long label wraps instead of being cut off.
 */

import { useCallback, useId } from 'react';
import { Button, TextInput } from '@/components/gds/PublicPrimitives';
import { MAX_NOTE_LENGTH } from '@/lib/photo-vetting/rejection';
import { optionsOf, type ResolvedVocabulary } from '@/lib/photo-vetting/vocabulary';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

const CHIP_STYLES = { root: { height: 'auto', minHeight: '2.5rem', paddingBlock: '0.375rem', paddingInline: '0.75rem' }, label: { lineHeight: 1.3, textAlign: 'left', whiteSpace: 'normal' } } as const;

interface ChoiceChipsProps {
  /** What is being chosen, as a visible heading. */
  heading: string;
  options: ReadonlyArray<{ key: string; label: string }>;
  /** The keys chosen now. */
  selected: readonly string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
}

/** A heading and a row of toggle buttons, one for each option; the options chosen look filled and say `aria-pressed`. */
export function ChoiceChips({ heading, options, selected, onToggle, disabled }: ChoiceChipsProps) {
  const headingId = useId();
  return (
    <div style={{ display: 'grid', gap: '0.375rem' }}>
      <div id={headingId} style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
        {heading}
      </div>
      <div role="group" aria-labelledby={headingId} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {options.map((option) => {
          const on = selected.includes(option.key);
          return (
            <Button key={option.key} type="button" size="sm" radius="md" variant={on ? 'filled' : 'light'} aria-pressed={on} disabled={disabled} onClick={() => onToggle(option.key)} styles={CHIP_STYLES} data-choice={option.key}>
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** Makes the two-step rejection explicit and shows a missing people-marking requirement when one blocks confirmation. */
export function RejectActionNotice({ markingMessage }: { markingMessage?: string | null }) {
  const language = useUiLanguage();
  const t = useCallback((source: string) => adminOperationText(source, language), [language]);
  return (
    <div lang={language} dir={uiLanguageDirection(language)} style={{ display: 'grid', gap: '0.375rem' }} data-rejection-progress>
      <h3 style={{ fontSize: '0.9375rem', margin: 0 }}>{t('Reject this photo')}</h3>
      <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', margin: 0 }}>
        This photo is still waiting. Select at least one reason, then press “Reject photo” to complete the rejection.{markingMessage ? ` ${markingMessage}` : ''}
      </p>
    </div>
  );
}

interface RejectReasonPickerProps {
  vocabulary: ResolvedVocabulary;
  /** The reason keys chosen now. */
  reasons: readonly string[];
  onToggleReason: (key: string) => void;
  note: string;
  onNote: (note: string) => void;
  disabled?: boolean;
}

/** "Why is it rejected?": the reasons the event offers now as toggle buttons (one or more are needed) and an optional note. */
export function RejectReasonPicker({ vocabulary, reasons, onToggleReason, note, onNote, disabled }: RejectReasonPickerProps) {
  const language = useUiLanguage();
  const t = useCallback((source: string) => adminOperationText(source, language), [language]);
  const options = optionsOf(vocabulary, 'reject_reason');
  return (
    <div lang={language} dir={uiLanguageDirection(language)} style={{ display: 'grid', gap: '0.75rem' }} data-reject-reasons>
      {options.length > 0 ? (
        <ChoiceChips heading={t('Select at least one rejection reason.')} options={options} selected={reasons} onToggle={onToggleReason} disabled={disabled} />
      ) : (
        <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', margin: 0 }}>{t('No reasons are offered for this event, so a photo cannot be rejected here. Ask an admin to switch one on.')}</p>
      )}
      <TextInput label={t('Note (optional)')} value={note} onChange={(event) => onNote(event.currentTarget.value)} maxLength={MAX_NOTE_LENGTH} disabled={disabled} />
    </div>
  );
}
