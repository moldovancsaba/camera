/**
 * The words of an e-mail to the user (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E1): a small markup that is safe by construction, with the variables filled in after the
 * text is read, rendered to the themed HTML and to the plain-text part from the same source. Pure; unit-tested in rich.test.ts.
 *
 * What an editor can write (nothing else is markup, and no raw HTML ever reaches an e-mail):
 * - paragraphs, separated by a blank line; a line break inside a paragraph stays a line break;
 * - a paragraph that starts with `# ` is a title, `-# ` is small text, `+# ` is large text;
 * - `**bold**`, `*italic*`, `[label](https://address)` (a link, shown bold and underlined), a bare web address (a link, as before);
 * - `{variable}` (lib/email/variables.ts), also as the address of a link: `[Your photo]({link})`;
 * - a paragraph that is only `![description](https://picture)` is a picture, and `[![description](https://picture)](https://address)` is a picture that is a link (issue 376: "a picture with
 *   a URL linked behind it"); the picture must be from the app's own storage (`allowedImage`), anything else is left out and reported;
 * - a backslash writes the next sign as it is: `\*`, `\[`.
 *
 * A text that has none of these reads exactly as it did when e-mails were plain text.
 *
 * The variables are filled **after** the text is read, so a value (a name a user typed) can never be markup, and only the editor's own words and the link variables are turned into
 * links. A variable that is not known, or that has no value for the event, is left out and reported, never sent as `{name}`.
 */

import { escapeHtml } from '@/lib/email/escape';
import { allowedImage } from '@/lib/theme/event-theme';

export type BlockKind = 'normal' | 'title' | 'small' | 'large';

/** A piece of text as the editor wrote it: words, or the name of a variable. */
export type Part = { kind: 'lit'; text: string } | { kind: 'var'; name: string };

export type Inline =
  | { t: 'text'; parts: Part[] }
  | { t: 'bold' | 'italic'; children: Inline[] }
  | { t: 'link'; label: Inline[]; href: Part[] }
  | { t: 'br' };

export interface TextBlock {
  kind: BlockKind;
  inlines: Inline[];
}

/** A paragraph that is a picture, as the editor wrote it: the address of the picture is as written, the link behind it may be a variable. */
export interface PictureBlock {
  kind: 'picture';
  alt: string;
  src: string;
  href: Part[] | null;
}

export type Block = TextBlock | PictureBlock;

const VARIABLE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const ESCAPABLE = '\\*[]()#{}+-';

function splitVariables(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const match of text.matchAll(VARIABLE)) {
    if (match.index > last) parts.push({ kind: 'lit', text: text.slice(last, match.index) });
    parts.push({ kind: 'var', name: match[1].toLowerCase() });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'lit', text: text.slice(last) });
  return parts;
}

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

/** The end of an emphasis opened at `from` (just after its opening mark): a closing mark that does not follow a space, and is not part of a longer run of marks. */
function closingMark(src: string, from: number, mark: '**' | '*'): number {
  let at = from;
  while (at < src.length) {
    const found = src.indexOf(mark, at);
    if (found < 0) return -1;
    const longer = mark === '*' && (src[found + 1] === '*' || src[found - 1] === '*');
    // A run of three marks closes the inner emphasis first: the closing pair of a bold is the last two of the run.
    let closing = found;
    if (mark === '**') while (src[closing + 2] === '*') closing += 1;
    if (!longer && closing > from && !isSpace(src[closing - 1])) return closing;
    at = found + (mark === '*' && src[found + 1] === '*' ? 2 : mark.length);
  }
  return -1;
}

function parseInline(src: string, allowLinks: boolean): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ t: 'text', parts: splitVariables(buffer) });
    buffer = '';
  };
  let i = 0;
  while (i < src.length) {
    const char = src[i];
    if (char === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) {
      buffer += src[i + 1];
      i += 2;
      continue;
    }
    if (char === '\n') {
      flush();
      out.push({ t: 'br' });
      i += 1;
      continue;
    }
    if (src.startsWith('**', i) && !isSpace(src[i + 2])) {
      const end = closingMark(src, i + 2, '**');
      if (end > 0) {
        flush();
        out.push({ t: 'bold', children: parseInline(src.slice(i + 2, end), allowLinks) });
        i = end + 2;
        continue;
      }
    }
    if (char === '*' && src[i + 1] !== '*' && !isSpace(src[i + 1])) {
      const end = closingMark(src, i + 1, '*');
      if (end > 0) {
        flush();
        out.push({ t: 'italic', children: parseInline(src.slice(i + 1, end), allowLinks) });
        i = end + 1;
        continue;
      }
    }
    if (char === '[' && allowLinks) {
      const match = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (match) {
        flush();
        out.push({ t: 'link', label: parseInline(match[1], false), href: splitVariables(match[2]) });
        i += match[0].length;
        continue;
      }
    }
    buffer += char;
    i += 1;
  }
  flush();
  return out;
}

const PREFIXES: Array<[string, BlockKind]> = [['-# ', 'small'], ['+# ', 'large'], ['# ', 'title']];

const PICTURE = /^!\[([^\]\n]*)\]\(([^)\s]+)\)$/;
const LINKED_PICTURE = /^\[!\[([^\]\n]*)\]\(([^)\s]+?)\)\]\(([^)\s]+)\)$/;

function pictureBlock(part: string): PictureBlock | null {
  const linked = LINKED_PICTURE.exec(part);
  if (linked) return { kind: 'picture', alt: linked[1].trim(), src: linked[2], href: splitVariables(linked[3]) };
  const plain = PICTURE.exec(part);
  return plain ? { kind: 'picture', alt: plain[1].trim(), src: plain[2], href: null } : null;
}

/** The text an editor wrote as blocks. Empty paragraphs are dropped. */
export function parseRich(source: string): Block[] {
  return source
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): Block => {
      const picture = pictureBlock(part);
      if (picture) return picture;
      const prefix = PREFIXES.find(([mark]) => part.startsWith(mark));
      const text = prefix ? part.slice(prefix[0].length).trimStart() : part;
      return { kind: prefix?.[1] ?? 'normal', inlines: parseInline(text, true) };
    })
    .filter((block) => block.kind === 'picture' || block.inlines.length > 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Variables filled in
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** What each variable stands for, by lower-case name. A name that is present but empty or undefined is a known variable with no value for this event. */
export type Values = Record<string, string | undefined>;

/** A run of text after the variables are filled in; `trusted` text (the editor's words, a link variable) may have web addresses turned into links, a user's name may not. */
export interface Run {
  text: string;
  trusted: boolean;
}

export type RInline =
  | { t: 'text'; runs: Run[] }
  | { t: 'bold' | 'italic'; children: RInline[] }
  | { t: 'link'; label: RInline[]; href: string | null }
  | { t: 'br' };

export interface RTextBlock {
  kind: BlockKind;
  inlines: RInline[];
}

/** A picture that passed the checks: its address is one the e-mail may load, the link behind it (if any) is an address the e-mail may link to. */
export interface RPictureBlock {
  kind: 'picture';
  alt: string;
  src: string;
  href: string | null;
}

export type RBlock = RTextBlock | RPictureBlock;

export interface Resolved {
  blocks: RBlock[];
  /** The addresses of pictures that are not from the app's own storage (or not https): they are left out of the e-mail. */
  refusedPictures: string[];
  /** Known variables used by the text that have no value for this event. */
  missing: string[];
  /** Names used by the text that are not variables at all (a typo). */
  unknown: string[];
}

/** The addresses an e-mail may link to. */
export function safeHref(href: string): string | null {
  const value = href.trim();
  return /^(https?:\/\/|mailto:)[^\s"<>]+$/i.test(value) ? value : null;
}

/**
 * The blocks with every variable replaced. `urlVariables` are the variables whose value is an address (`link`, `terms`): they are the only values that may become links.
 */
export function resolveRich(blocks: Block[], values: Values, urlVariables: readonly string[] = ['link', 'terms']): Resolved {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const refusedPictures: string[] = [];

  const valueOf = (name: string): string => {
    if (!Object.hasOwn(values, name)) {
      unknown.add(name);
      return '';
    }
    const value = values[name]?.trim();
    if (!value) missing.add(name);
    return value ?? '';
  };

  const resolveBlock = (block: Block): RBlock | null => {
    if (block.kind !== 'picture') return { kind: block.kind, inlines: block.inlines.map(resolveInline) };
    const src = allowedImage(block.src);
    if (!src) {
      refusedPictures.push(block.src);
      return null;
    }
    return { kind: 'picture', alt: block.alt, src, href: block.href ? safeHref(block.href.map((part) => (part.kind === 'lit' ? part.text : valueOf(part.name))).join('')) : null };
  };

  const resolveInline = (inline: Inline): RInline => {
    switch (inline.t) {
      case 'text':
        return {
          t: 'text',
          runs: inline.parts.map((part) => (part.kind === 'lit' ? { text: part.text, trusted: true } : { text: valueOf(part.name), trusted: urlVariables.includes(part.name) })).filter((run) => run.text !== ''),
        };
      case 'bold':
      case 'italic':
        return { t: inline.t, children: inline.children.map(resolveInline) };
      case 'link':
        return {
          t: 'link',
          label: inline.label.map(resolveInline),
          href: safeHref(inline.href.map((part) => (part.kind === 'lit' ? part.text : valueOf(part.name))).join('')),
        };
      case 'br':
        return inline;
    }
  };

  const resolved = blocks
    .map(resolveBlock)
    .filter((block): block is RBlock => block !== null)
    // A paragraph that is empty once the variables are left out (only a variable with no value) is dropped.
    .filter((block) => block.kind === 'picture' || block.inlines.some((inline) => inline.t !== 'br' && inlineText(inline).trim() !== ''));
  return { blocks: resolved, refusedPictures, missing: [...missing], unknown: [...unknown] };
}

function inlineText(inline: RInline): string {
  switch (inline.t) {
    case 'text':
      return inline.runs.map((run) => run.text).join('');
    case 'bold':
    case 'italic':
      return inline.children.map(inlineText).join('');
    case 'link':
      return inline.label.map(inlineText).join('');
    case 'br':
      return '\n';
  }
}

/** The text of a template with its variables filled and no markup of its own: for the subject line. */
export function fillPlain(template: string, values: Values): { text: string; missing: string[]; unknown: string[] } {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const text = template.replace(VARIABLE, (_match, raw: string) => {
    const name = raw.toLowerCase();
    if (!Object.hasOwn(values, name)) {
      unknown.add(name);
      return '';
    }
    const value = values[name]?.trim();
    if (!value) missing.add(name);
    return value ?? '';
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const URL_IN_TEXT = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/**
 * Lets a long word break inside a narrow mail client (issue 382: a long share link made the e-mail wider than a phone screen, so the user had to scroll sideways). `overflow-wrap:anywhere` counts the break
 * opportunities in a word when the width of a table cell is worked out, so the cell can shrink; `word-wrap:break-word` and `word-break:break-word` are the same rule under the names older mail clients know;
 * a client that knows none of them still gets the soft break points `wbr` puts into an address. Used on every element that holds the user's words or a link.
 */
export const EMAIL_WRAP_STYLE = 'overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;';

/** An address longer than this gets break points (`wbr`); a short one is left as it is. */
const BREAK_POINTS_FROM = 40;

/** Where a long address may break: after a single slash (not the two of `https://`), a query sign, an ampersand, an equals sign or a hash. A `wbr` is a break point that is not in the text when it is copied, so a long address wraps at those places even in a client that ignores `overflow-wrap`. Applied to escaped text. */
function withBreakPoints(escaped: string): string {
  return escaped.length <= BREAK_POINTS_FROM ? escaped : escaped.replace(/(&amp;|[?=#]|(?<!\/)\/(?!\/))/g, '$1<wbr>');
}

export interface RichStyle {
  /** The link colour of the theme. */
  link: string;
}

/** The longest web address written out in full in the text of an e-mail; a longer one is shown as its first part and an ellipsis, the link behind it stays whole (issue 382). A share link is about 60 characters, so it is written out. */
export const MAX_SHOWN_ADDRESS = 64;

/** An address as the text of its link: whole, or for a very long one its first part and an ellipsis. */
export function shownAddress(address: string): string {
  return address.length <= MAX_SHOWN_ADDRESS ? address : `${address.slice(0, MAX_SHOWN_ADDRESS - 1)}\u2026`;
}

/** A run as HTML: escaped; a trusted run has its web addresses turned into links in the link colour, which may break where they must (EMAIL_WRAP_STYLE) and show a very long address shortened. */
function runHtml(run: Run, style: RichStyle): string {
  if (!run.trusted) return escapeHtml(run.text);
  let out = '';
  let last = 0;
  for (const match of run.text.matchAll(URL_IN_TEXT)) {
    const url = match[0];
    out += escapeHtml(run.text.slice(last, match.index));
    out += `<a href="${escapeHtml(url)}" style="color:${style.link};text-decoration:underline;${EMAIL_WRAP_STYLE}">${withBreakPoints(escapeHtml(shownAddress(url)))}</a>`;
    last = match.index + url.length;
  }
  return out + escapeHtml(run.text.slice(last));
}

function inlineHtml(inline: RInline, style: RichStyle): string {
  switch (inline.t) {
    case 'text':
      return inline.runs.map((run) => runHtml(run, style)).join('');
    case 'bold':
      return `<strong>${inline.children.map((child) => inlineHtml(child, style)).join('')}</strong>`;
    case 'italic':
      return `<em>${inline.children.map((child) => inlineHtml(child, style)).join('')}</em>`;
    case 'link': {
      const label = inline.label.map((child) => inlineHtml(child, style)).join('');
      return inline.href ? `<a href="${escapeHtml(inline.href)}" style="color:${style.link};font-weight:700;text-decoration:underline;${EMAIL_WRAP_STYLE}">${label}</a>` : label;
    }
    case 'br':
      return '<br />';
  }
}

const BLOCK_STYLE: Record<BlockKind, string> = {
  normal: `margin:0 0 16px 0;${EMAIL_WRAP_STYLE}`,
  title: `margin:0 0 16px 0;font-size:22px;line-height:1.3;font-weight:700;${EMAIL_WRAP_STYLE}`,
  large: `margin:0 0 16px 0;font-size:19px;line-height:1.45;${EMAIL_WRAP_STYLE}`,
  small: `margin:0 0 10px 0;font-size:12px;line-height:1.45;${EMAIL_WRAP_STYLE}`,
};

/** The blocks as email HTML: one paragraph each, with inline styles (email clients need them). `defaultKind` is the size of a paragraph with no prefix (the legal part is small print). */
export function richHtml(blocks: RBlock[], style: RichStyle, defaultKind: BlockKind = 'normal'): string {
  return blocks
    .map((block) => {
      if (block.kind === 'picture') {
        const image = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" style="display:inline-block;max-width:100%;height:auto;border:0;" />`;
        return `<p style="margin:0 0 16px 0;text-align:center;">${block.href ? `<a href="${escapeHtml(block.href)}" style="text-decoration:none;">${image}</a>` : image}</p>`;
      }
      return `<p style="${BLOCK_STYLE[block.kind === 'normal' ? defaultKind : block.kind]}">${block.inlines.map((inline) => inlineHtml(inline, style)).join('')}</p>`;
    })
    .join('');
}

function inlineTextOf(inline: RInline): string {
  switch (inline.t) {
    case 'text':
      return inline.runs.map((run) => run.text).join('');
    case 'bold':
    case 'italic':
      return inline.children.map(inlineTextOf).join('');
    case 'link': {
      const label = inline.label.map(inlineTextOf).join('');
      return inline.href && inline.href !== label ? `${label} (${inline.href})` : label;
    }
    case 'br':
      return '\n';
  }
}

/** The blocks as the plain-text part of the email: no markup, a link as `label (address)`, paragraphs separated by a blank line. */
export function richText(blocks: RBlock[]): string {
  return blocks
    .map((block) => (block.kind === 'picture' ? (block.href ? `${block.alt || 'Picture'}: ${block.href}` : block.alt) : block.inlines.map(inlineTextOf).join('').trim()))
    .filter((paragraph) => paragraph !== '')
    .join('\n\n');
}
