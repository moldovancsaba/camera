/**
 * The five e-mails a user can get from an event (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E7; owner, 2026-10-09): **welcome** (when somebody registers, off by default), **arrived** (when
 * somebody submits a photo, off), **approved** (when the photo is approved, with the links, on), **declined** (when it is declined, on) and **follow up** (a week after the event, to look back at
 * the memory, off). Each has a switch (a stored choice wins; an event with none follows the default), a subject and a message (the event's own, else the dictionary text in the event's
 * language with the levels of the text defaults). Pure and client-safe; unit-tested in types.test.ts.
 *
 * Stored in `Event.notifications.types`. The older fields of the notification settings still mean what they meant: the "after save" pair is the approved e-mail, the two try-on e-mails stay.
 */

import { translate, type UiLanguage } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages.en';
import type { TextOverrides } from '@/lib/i18n/overrides';

export const EMAIL_TYPES = ['welcome', 'arrived', 'approved', 'declined', 'followUp'] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

export interface EmailTypeInfo {
  label: string;
  /** When it is sent, for the editor. */
  when: string;
  /** Whether it is on for an event that never chose. */
  defaultOn: boolean;
  subjectKey: MessageKey;
  bodyKey: MessageKey;
  /** The dictionary text of the button, or null when the e-mail has no button. */
  buttonKey: MessageKey | null;
  /** The variable the button leads to: the link to the photo, or the link to the event. */
  buttonLink: 'link' | 'eventlink' | null;
}

export const EMAIL_TYPE_INFO: Record<EmailType, EmailTypeInfo> = {
  welcome: {
    label: 'Welcome',
    when: 'When somebody registers: gives a name and an e-mail, or signs in, before the photo.',
    defaultOn: false,
    subjectKey: 'email.welcomeSubject',
    bodyKey: 'email.welcomeBody',
    buttonKey: 'email.buttonWelcome',
    buttonLink: 'eventlink',
  },
  arrived: {
    label: 'Arrived',
    when: 'When somebody submits a photo (later other media): we got it.',
    defaultOn: false,
    subjectKey: 'email.arrivedSubject',
    bodyKey: 'email.arrivedBody',
    buttonKey: null,
    buttonLink: null,
  },
  approved: {
    label: 'Approved',
    when: 'When the photo is approved: with the links to it. At once for an event without photo vetting, when a moderator approves it for one with.',
    defaultOn: true,
    subjectKey: 'email.subject',
    bodyKey: 'email.body',
    buttonKey: 'email.buttonSee',
    buttonLink: 'link',
  },
  declined: {
    label: 'Declined',
    when: 'When a moderator declines the photo (events with photo vetting).',
    defaultOn: true,
    subjectKey: 'email.notApprovedSubject',
    bodyKey: 'email.notApprovedBody',
    buttonKey: 'email.buttonAnother',
    buttonLink: 'eventlink',
  },
  followUp: {
    label: 'Follow up',
    when: 'One week after the event, to look back at the memory, to the users who have an approved photo. Not sent yet: the daily job that sends it is added later.',
    defaultOn: false,
    subjectKey: 'email.followUpSubject',
    bodyKey: 'email.followUpBody',
    buttonKey: 'email.buttonSee',
    buttonLink: 'link',
  },
};

/** What an event stored for one type: absent fields follow the default. */
export interface TypeSetting {
  enabled?: boolean;
  subject?: string;
  body?: string;
}

export type TypeSettings = Partial<Record<EmailType, TypeSetting>>;

export const SUBJECT_MAX = 180;
export const BODY_MAX = 5000;

const text = (value: unknown, max: number, newlines: boolean): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = (newlines ? value.replace(/\r\n?/g, '\n') : value).trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

/** What the notification settings say about the five types, checked: a switch is a boolean, a subject or message is text within its limit; anything else is not a choice. */
export function parseTypeSettings(input: unknown): TypeSettings {
  const out: TypeSettings = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const type of EMAIL_TYPES) {
    const row = (input as Record<string, unknown>)[type];
    if (!row || typeof row !== 'object') continue;
    const { enabled, subject, body } = row as Record<string, unknown>;
    const setting: TypeSetting = {
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
      ...(text(subject, SUBJECT_MAX, false) ? { subject: text(subject, SUBJECT_MAX, false) } : {}),
      ...(text(body, BODY_MAX, true) ? { body: text(body, BODY_MAX, true) } : {}),
    };
    if (Object.keys(setting).length > 0) out[type] = setting;
  }
  return out;
}

/** The default subject, message and button of a type in a language, with the wordings written for the partner or the event. */
export function typeDefaults(type: EmailType, language: UiLanguage, texts?: TextOverrides | null): { subject: string; body: string; button: string | null } {
  const info = EMAIL_TYPE_INFO[type];
  return {
    subject: translate(language, info.subjectKey, undefined, texts),
    body: translate(language, info.bodyKey, undefined, texts),
    button: info.buttonKey ? translate(language, info.buttonKey, undefined, texts) : null,
  };
}

/** One type as the sender needs it: whether it is on, the stored choice of the switch (null = follows the default), and the event's own subject and message (null = the default). */
export interface ResolvedType {
  enabled: boolean;
  chosen: boolean | null;
  subject: string | null;
  body: string | null;
}
