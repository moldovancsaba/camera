/**
 * The HTML of a guest email in the theme of the event (camera#285, J6): the event's page colour as a header band with its logo (or emoji),
 * the message on a card with the card colours, and the main link as a button in the theme's button colours. Table layout with inline styles,
 * as email clients need; the words are drawn by lib/email/rich.ts (bold, italic, titles, links, small and large text). Pure; unit-tested in themed-html.test.ts.
 */

import { escapeHtml } from '@/lib/email/escape';
import { EMAIL_WRAP_STYLE, parseRich, resolveRich, richHtml, type RBlock } from '@/lib/email/rich';
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
  /** The legal part with its variables filled in: small print in the muted colour under the message and the button (epic 463, E2); omitted when there is none. */
  legal?: RBlock[] | null;
  /** The main link, shown as a button as well as in the text; omitted when there is none. */
  button?: { label: string; url: string } | null;
}

export function renderThemedEmail({ theme, eventName, bodyText, content, legal, button }: ThemedEmailInput): string {
  const font = emailFont(theme.font.family);
  const mark = theme.logoUrl
    ? `<img src="${escapeHtml(theme.logoUrl)}" alt="${escapeHtml(eventName)}" height="56" style="display:block;margin:0 auto;border:0;max-height:56px;max-width:240px;height:auto;" />`
    : theme.emoji
      ? `<div style="font-size:44px;line-height:1;text-align:center;">${escapeHtml(theme.emoji)}</div>`
      : '';
  const paragraphs = richHtml(content ?? resolveRich(parseRich(bodyText ?? ''), {}).blocks, { link: theme.link });
  const cta = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;max-width:100%;"><tr><td bgcolor="${theme.buttonBackground}" style="background:${theme.buttonBackground};border-radius:8px;${EMAIL_WRAP_STYLE}"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:14px 28px;box-sizing:border-box;max-width:100%;font-family:${font};font-size:16px;font-weight:700;color:${theme.buttonText};text-decoration:none;${EMAIL_WRAP_STYLE}">${escapeHtml(button.label)}</a></td></tr></table>`
    : '';

  const legalPart = legal && legal.length > 0 ? `<div style="margin-top:20px;color:${theme.cardMuted};${EMAIL_WRAP_STYLE}">${richHtml(legal, { link: theme.link }, 'small')}</div>` : '';

  const footer = theme.emailFooterImageUrl
    ? `\n<tr><td style="padding:16px 0 0 0;"><img src="${escapeHtml(theme.emailFooterImageUrl)}" alt="${escapeHtml(eventName)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:${theme.radius};" /></td></tr>`
    : '';

  // Nothing in the e-mail may be wider than the screen (issue 382): the tables have a fixed layout, so a cell is never wider than the table, and every cell that holds words may break a long word
  // (EMAIL_WRAP_STYLE); the viewport line makes a phone use its own width.
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:${theme.background};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.background}" style="background:${theme.background};table-layout:fixed;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;table-layout:fixed;">
<tr><td style="padding:8px 0 20px 0;font-family:${font};text-align:center;color:${theme.heading};${EMAIL_WRAP_STYLE}">${mark}<div style="margin-top:12px;font-size:20px;font-weight:700;color:${theme.heading};${EMAIL_WRAP_STYLE}">${escapeHtml(eventName)}</div></td></tr>
<tr><td bgcolor="${theme.cardBackground}" style="background:${theme.cardBackground};border:1px solid ${theme.cardBorder};border-radius:${theme.radius};padding:24px;font-family:${font};font-size:16px;line-height:1.55;color:${theme.cardText};${EMAIL_WRAP_STYLE}">${paragraphs}${cta}${legalPart}</td></tr>${footer}
</table>
</td></tr>
</table>
</body></html>`;
}
