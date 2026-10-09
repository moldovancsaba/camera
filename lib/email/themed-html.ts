/**
 * The HTML of a guest email in the theme of the event (camera#285, J6): the event's page colour as a header band with its logo (or emoji),
 * the message on a card with the card colours, and the main link as a button in the theme's button colours. Table layout with inline styles,
 * as email clients need; the words are drawn by lib/email/rich.ts (bold, italic, titles, links, small and large text). Pure; unit-tested in themed-html.test.ts.
 */

import { escapeHtml } from '@/lib/email/escape';
import { parseRich, resolveRich, richHtml, type RBlock } from '@/lib/email/rich';
import type { EventTheme } from '@/lib/theme/event-theme';

export { escapeHtml };

const FONT_FALLBACK = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

/** The family as an email font stack: the event's own font first (clients that have it), then web-safe fonts. */
function emailFont(family: string): string {
  const clean = family.replace(/[^A-Za-z0-9 \-]/g, '').trim();
  return clean ? `'${clean}', ${FONT_FALLBACK}` : FONT_FALLBACK;
}

export interface ThemedEmailInput {
  theme: EventTheme;
  eventName: string;
  /** The message as the editor wrote it (lib/email/rich.ts), variables already filled in; a text with no markup reads as plain text, paragraphs separated by blank lines. */
  bodyText?: string;
  /** The message with its variables filled in (`resolveRich`); used instead of `bodyText` when given. */
  content?: RBlock[];
  /** The main link, shown as a button as well as in the text; omitted when there is none. */
  button?: { label: string; url: string } | null;
}

export function renderThemedEmail({ theme, eventName, bodyText, content, button }: ThemedEmailInput): string {
  const font = emailFont(theme.font.family);
  const mark = theme.logoUrl
    ? `<img src="${escapeHtml(theme.logoUrl)}" alt="${escapeHtml(eventName)}" height="56" style="display:block;margin:0 auto;border:0;max-height:56px;max-width:240px;height:auto;" />`
    : theme.emoji
      ? `<div style="font-size:44px;line-height:1;text-align:center;">${escapeHtml(theme.emoji)}</div>`
      : '';
  const paragraphs = richHtml(content ?? resolveRich(parseRich(bodyText ?? ''), {}).blocks, { link: theme.link });
  const cta = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;"><tr><td bgcolor="${theme.buttonBackground}" style="background:${theme.buttonBackground};border-radius:8px;"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:16px;font-weight:700;color:${theme.buttonText};text-decoration:none;">${escapeHtml(button.label)}</a></td></tr></table>`
    : '';

  const footer = theme.emailFooterImageUrl
    ? `\n<tr><td style="padding:16px 0 0 0;"><img src="${escapeHtml(theme.emailFooterImageUrl)}" alt="${escapeHtml(eventName)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:${theme.radius};" /></td></tr>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${theme.background};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.background}" style="background:${theme.background};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:8px 0 20px 0;font-family:${font};text-align:center;color:${theme.heading};">${mark}<div style="margin-top:12px;font-size:20px;font-weight:700;color:${theme.heading};">${escapeHtml(eventName)}</div></td></tr>
<tr><td bgcolor="${theme.cardBackground}" style="background:${theme.cardBackground};border:1px solid ${theme.cardBorder};border-radius:${theme.radius};padding:24px;font-family:${font};font-size:16px;line-height:1.55;color:${theme.cardText};">${paragraphs}${cta}</td></tr>${footer}
</table>
</td></tr>
</table>
</body></html>`;
}
