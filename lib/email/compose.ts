/**
 * One e-mail to the user, composed from its parts (epic 463): the subject and message templates and the legal part, with the variables filled in, rendered to the subject line, the
 * themed HTML and the plain-text part. The sender and the editor's preview both call this, so what the editor sees is what a user gets. Pure; unit-tested through the sender and
 * the preview route.
 */

import { EMAIL_WRAP_STYLE, fillPlain, parseRich, resolveRich, richHtml, richText, type Values } from '@/lib/email/rich';
import { withoutStandardLegalTail } from '@/lib/email/legal-rules';
import { renderThemedEmail } from '@/lib/email/themed-html';
import { URL_VARIABLES } from '@/lib/email/variables';
import type { EventTheme } from '@/lib/theme/event-theme';

export interface ComposeInput {
  subjectTemplate: string;
  bodyTemplate: string;
  /** The legal part as the editor wrote it; null or empty for none. */
  legal?: string | null;
  values: Values;
  /** The look of the event; null keeps the plain layout. */
  theme: EventTheme | null;
  eventName: string;
  /** The button of a themed e-mail; null for none (an e-mail with no link to give). */
  button?: { label: string; url: string } | null;
}

export interface Composed {
  subject: string;
  html: string;
  text: string;
  /** Variables the texts use that this e-mail could not fill: left out of it. */
  warnings: { withoutValue: string[]; unknown: string[]; refusedPictures: string[] };
}

export function composeEmail(input: ComposeInput): Composed {
  const subjectFilled = fillPlain(input.subjectTemplate, input.values);
  const legalSource = input.legal?.trim() || null;
  // With a legal part the standard terms paragraph at the end of a template is not written twice.
  const body = resolveRich(parseRich(legalSource ? withoutStandardLegalTail(input.bodyTemplate) : input.bodyTemplate), input.values, URL_VARIABLES);
  const legal = legalSource ? resolveRich(parseRich(legalSource), input.values, URL_VARIABLES) : null;
  const html = input.theme
    ? renderThemedEmail({ theme: input.theme, eventName: input.eventName, content: body.blocks, legal: legal?.blocks ?? null, button: input.button ?? null })
    : `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;${EMAIL_WRAP_STYLE}">${richHtml(body.blocks, { link: 'inherit' })}${legal ? `<div style="opacity:0.75;${EMAIL_WRAP_STYLE}">${richHtml(legal.blocks, { link: 'inherit' }, 'small')}</div>` : ''}</div>
    `;
  return {
    subject: subjectFilled.text.replace(/\s+/g, ' ').trim(),
    html,
    text: [richText(body.blocks), legal ? richText(legal.blocks) : ''].filter(Boolean).join('\n\n'),
    warnings: {
      withoutValue: [...new Set([...subjectFilled.missing, ...body.missing, ...(legal?.missing ?? [])])],
      unknown: [...new Set([...subjectFilled.unknown, ...body.unknown, ...(legal?.unknown ?? [])])],
      refusedPictures: [...new Set([...body.refusedPictures, ...(legal?.refusedPictures ?? [])])],
    },
  };
}
