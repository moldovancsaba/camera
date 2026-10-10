/**
 * One of the five e-mails of an event (epic 463, lib/email/types.ts), prepared for sending: whether the event has it on (its own choice, else its partner's default, else the standard of the type), and
 * everything that is the same for every user of the event (the texts in the event's language, the look, the legal part, the facts for the variables), read once, so a job that sends the same e-mail
 * to many users does not read them again for each. `build` adds the user. Used by the welcome and arrived triggers (triggers.ts) and by the follow-up job (follow-up.ts). Server side; unit-tested through
 * both.
 */

import type { Db, Document } from 'mongodb';
import { eventLinkOf, emailFactsOf } from '@/lib/email/event-link';
import { loadEventLegal } from '@/lib/email/legal';
import type { SubmissionNotificationInput } from '@/lib/email/submission-notification';
import { normalizeSubmissionEmailPolicy, themeOf } from '@/lib/email/submission-result-email';
import { partnerSwitchDefaults, typeDefaults, type EmailType } from '@/lib/email/types';
import type { UiLanguage } from '@/lib/i18n';
import { loadEventTexts } from '@/lib/i18n/overrides';

export interface PreparedEmail {
  /** Whether the event has this e-mail on. When it is off nothing else was read, and `build` must not be called. */
  enabled: boolean;
  language: UiLanguage;
  /** The e-mail to one user. `shareUrl` is what `{link}` and the button lead to: the link to the event unless the caller has a better one (the photo). */
  build(to: { email: string; name: string | null }, shareUrl?: string): SubmissionNotificationInput;
}

export async function prepareTypedEmail(db: Db, event: Document, type: EmailType): Promise<PreparedEmail> {
  const loaded = await loadEventTexts(db, event);
  const policy = normalizeSubmissionEmailPolicy(event.notifications, loaded.language, loaded.overrides, partnerSwitchDefaults(loaded.partner));
  const row = policy.types[type];
  if (!row.enabled) {
    return {
      enabled: false,
      language: loaded.language,
      build: () => {
        throw new Error(`The ${type} e-mail is off for this event`);
      },
    };
  }
  const defaults = typeDefaults(type, loaded.language, loaded.overrides);
  const theme = await themeOf(db, event as never);
  const legal = (await loadEventLegal(db, event, loaded.partner).catch(() => null))?.effective?.text ?? null;
  const facts = emailFactsOf(event);
  const eventLink = eventLinkOf(event) ?? '';
  return {
    enabled: true,
    language: loaded.language,
    build: (to, shareUrl) => ({
      recipientEmail: to.email,
      recipientName: to.name,
      eventName: typeof event.name === 'string' ? event.name : null,
      // The welcome and arrived e-mails link to the event itself (its short link when it has a URL slug); arrived has no button. The follow up gives the photo's own link.
      shareUrl: shareUrl ?? eventLink,
      termsUrl: policy.termsUrl,
      senderName: policy.senderName,
      subjectTemplate: row.subject ?? defaults.subject,
      bodyTemplate: row.body ?? defaults.body,
      theme,
      buttonLabel: defaults.button,
      noButton: defaults.button === null,
      language: loaded.language,
      texts: loaded.overrides,
      facts,
      legal,
    }),
  };
}
