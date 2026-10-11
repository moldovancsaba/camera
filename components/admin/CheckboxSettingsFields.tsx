'use client';

/**
 * The settings of the checkboxes a user can meet (issue 558, owner answer 297: "all types of checkboxes have to have an on/off toggle and a required checkbox on the settings as every market has its own law"),
 * as the same rows in the partner editor (the default of all its events) and in the event's page editor (its own choice, or "Same as the partner"). One row per kind of checkbox
 * (lib/events/checkbox-settings.ts); each row is one select whose choices are the combinations that mean something: shown and required, shown and optional, not shown.
 * "Required" here is a choice an editor made, so it is also checked by the server: a photo saved without it is refused. The wording of the checkboxes themselves is the Dictionary's.
 */

import type { CheckboxKind, CheckboxMode, EffectiveCheckbox, EffectiveCheckboxes } from '@/lib/events/checkbox-settings';

export type CheckboxModes = Record<CheckboxKind, CheckboxMode>;

interface KindInfo {
  label: string;
  help: string;
  required: string;
  optional: string;
  off: string;
  /** What the kind is when nobody chose, in words, for the first choice of a partner ("Standard") and of an event. */
  standard: string;
}

const DOCUMENT_HELP = 'A checkbox of the default consent page, which an event uses until it has a consent page of its own (an own page has these two settings on each of its checkboxes). Not shown: the user is not asked and no record is kept; with all three off there is no default consent page.';
const DOCUMENT_SHORT = 'A checkbox of the default consent page: the same choices as above.';

const KINDS: Record<CheckboxKind, KindInfo> = {
  terms: { label: 'Terms and conditions', help: DOCUMENT_HELP, required: 'Shown, required', optional: 'Shown, optional', off: 'Not shown', standard: 'shown, required' },
  cookies: { label: 'Cookies', help: DOCUMENT_SHORT, required: 'Shown, required', optional: 'Shown, optional', off: 'Not shown', standard: 'shown, required' },
  privacy: { label: 'Privacy policy', help: DOCUMENT_SHORT, required: 'Shown, required', optional: 'Shown, optional', off: 'Not shown', standard: 'shown, required' },
  acceptance: {
    label: 'Acceptance on the Who-are-you page',
    help: 'The consent page’s checkboxes as one small checkbox with one sentence on the Who-are-you page, instead of a page of its own. Required: everything on the page stays off until it is ticked. Optional: the page works without it and the records say whether it was ticked. Not there: the consent page is a page of its own.',
    required: 'On the Who-are-you page, required',
    optional: 'On the Who-are-you page, optional',
    off: 'Not there: a consent page of its own',
    standard: 'own page',
  },
  gallery: {
    label: 'Permission to show the photo in the public gallery',
    help: 'Some services and markets need the user’s own permission before a photo is shown on a public wall or gallery; for others the terms the user accepts are enough. Optional (Ask): one checkbox, not ticked, where the photo is saved; only a ticked box puts the photo on the wall. Required: the photo cannot be saved without the tick.',
    required: 'Asked, required: the photo cannot be saved without it',
    optional: 'Asked, optional: a box not ticked',
    off: 'Not asked: the terms the user accepts cover it',
    standard: 'not asked',
  },
};

/** What a kind is, in words, for the label of the choice that follows the partner (or the standard). */
export function describeEffective(kind: CheckboxKind, effective: EffectiveCheckbox): string {
  const info = KINDS[kind];
  if (!effective.shown) return kind === 'acceptance' ? info.standard : kind === 'gallery' ? info.standard : 'not shown';
  return effective.required ? 'required' : 'optional';
}

const ROW_KINDS: readonly CheckboxKind[] = ['terms', 'cookies', 'privacy', 'acceptance', 'gallery'];

export interface CheckboxSettingsFieldsProps {
  modes: CheckboxModes;
  onChange: (kind: CheckboxKind, mode: CheckboxMode) => void;
  /** `partner`: the first choice is the standard. `event`: the first choice is "Same as the partner", and says what that gives. */
  level: 'partner' | 'event';
  /** What an event would get if it followed its partner (the event editor): the words of the first choice. */
  followed?: EffectiveCheckboxes;
  /** Which rows to show; all five by default. */
  kinds?: readonly CheckboxKind[];
}

export default function CheckboxSettingsFields({ modes, onChange, level, followed, kinds = ROW_KINDS }: CheckboxSettingsFieldsProps) {
  return (
    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1fr)' }} data-checkbox-settings>
      {ROW_KINDS.filter((kind) => kinds.includes(kind)).map((kind) => {
        const info = KINDS[kind];
        // The public gallery permission has no "no choice" state at the partner: not asking is its standard, and it is what the partner editor always saved.
        const noChoiceIsStandard = level === 'partner' && kind === 'gallery';
        const value = noChoiceIsStandard && modes[kind] === '' ? 'off' : modes[kind];
        const first =
          level === 'event'
            ? `Same as the partner (${followed ? describeEffective(kind, followed[kind]) : info.standard})`
            : `Standard (${info.standard}, as before)`;
        return (
          <label key={kind} style={{ display: 'grid', gap: '0.35rem', fontWeight: 700, gridTemplateColumns: 'minmax(0, 1fr)' }} data-checkbox-setting={kind} {...(kind === 'gallery' ? { 'data-gallery-consent-setting': true } : {})}>
            {info.label}
            <select value={value} onChange={(event) => onChange(kind, event.currentTarget.value as CheckboxMode)} style={{ minHeight: 44, padding: '0 0.75rem', width: '100%', minWidth: 0, maxWidth: '100%' }}>
              {noChoiceIsStandard ? null : <option value="">{first}</option>}
              <option value="required">{info.required}</option>
              <option value="optional">{info.optional}</option>
              <option value="off">{noChoiceIsStandard ? `${info.off} (standard)` : info.off}</option>
            </select>
            <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', fontWeight: 400 }}>{info.help}</span>
          </label>
        );
      })}
      <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', margin: 0 }}>“Required” is checked by the server too: a photo saved without it is refused. Standard, where it is offered, is what the journey did before: required on the page only.</p>
    </div>
  );
}
