/**
 * The HTML of a guest email in the theme of the event (camera#285, J6): the event's page colour as a header band with its logo (or emoji),
 * the message on a card with the card colours, and the main link as a button in the theme's button colours. Table layout with inline styles,
 * as email clients need; the plain-text part of the email is unchanged. Pure; unit-tested in themed-html.test.ts.
 */

import type { EventTheme } from '@/lib/theme/event-theme';

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const FONT_FALLBACK = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const URL_IN_TEXT = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** One plain-text paragraph as HTML: escaped, its links as anchors in the link colour, its line breaks kept. */
export function paragraphHtml(text: string, linkColour: string): string {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(URL_IN_TEXT, (url) => `<a href="${url}" style="color:${linkColour};text-decoration:underline;">${url}</a>`);
  return linked.replace(/\n/g, '<br />');
}

/** The family as an email font stack: the event's own font first (clients that have it), then web-safe fonts. */
function emailFont(family: string): string {
  const clean = family.replace(/[^A-Za-z0-9 \-]/g, '').trim();
  return clean ? `'${clean}', ${FONT_FALLBACK}` : FONT_FALLBACK;
}

export interface ThemedEmailInput {
  theme: EventTheme;
  eventName: string;
  /** The message, plain text; paragraphs are separated by blank lines. */
  bodyText: string;
  /** The main link, shown as a button as well as in the text; omitted when there is none. */
  button?: { label: string; url: string } | null;
}

export function renderThemedEmail({ theme, eventName, bodyText, button }: ThemedEmailInput): string {
  const font = emailFont(theme.font.family);
  const mark = theme.logoUrl
    ? `<img src="${escapeHtml(theme.logoUrl)}" alt="${escapeHtml(eventName)}" height="56" style="display:block;margin:0 auto;border:0;max-height:56px;max-width:240px;height:auto;" />`
    : theme.emoji
      ? `<div style="font-size:44px;line-height:1;text-align:center;">${escapeHtml(theme.emoji)}</div>`
      : '';
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p style="margin:0 0 16px 0;">${paragraphHtml(part, theme.link)}</p>`)
    .join('');
  const cta = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;"><tr><td bgcolor="${theme.buttonBackground}" style="background:${theme.buttonBackground};border-radius:8px;"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:16px;font-weight:700;color:${theme.buttonText};text-decoration:none;">${escapeHtml(button.label)}</a></td></tr></table>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${theme.background};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.background}" style="background:${theme.background};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:8px 0 20px 0;font-family:${font};text-align:center;color:${theme.heading};">${mark}<div style="margin-top:12px;font-size:20px;font-weight:700;color:${theme.heading};">${escapeHtml(eventName)}</div></td></tr>
<tr><td bgcolor="${theme.cardBackground}" style="background:${theme.cardBackground};border:1px solid ${theme.cardBorder};border-radius:${theme.radius};padding:24px;font-family:${font};font-size:16px;line-height:1.55;color:${theme.cardText};">${paragraphs}${cta}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
