/**
 * What the toolbar of the e-mail editor does to the text (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E4): each function takes the text and the selection of the editor and gives the new
 * text and the new selection. The editor writes the markup of lib/email/rich.ts, so these only add or take away its marks. Pure; unit-tested in editor-ops.test.ts.
 */

import type { BlockKind } from '@/lib/email/rich';

export interface Edit {
  text: string;
  /** The selection after the edit. */
  start: number;
  end: number;
}

const PREFIX: Record<BlockKind, string> = { normal: '', title: '# ', small: '-# ', large: '+# ' };

/** Bold (`**`) or italic (`*`) around the selection; applied again to a selection that already has the marks, it takes them away. With nothing selected a word to type over is put in. */
export function wrapSelection(text: string, start: number, end: number, mark: '**' | '*', placeholder = 'text'): Edit {
  const selected = text.slice(start, end);
  const before = text.slice(Math.max(0, start - mark.length), start);
  const after = text.slice(end, end + mark.length);
  // Already wrapped outside the selection (and, for italic, not by the longer bold mark): take the marks away.
  const bold = mark === '*' && text.slice(Math.max(0, start - 2), start) === '**' && text.slice(end, end + 2) === '**';
  if (!bold && before === mark && after === mark && selected) {
    return { text: text.slice(0, start - mark.length) + selected + text.slice(end + mark.length), start: start - mark.length, end: end - mark.length };
  }
  // Wrapped inside the selection: take the marks away.
  if (selected.length > mark.length * 2 && selected.startsWith(mark) && selected.endsWith(mark) && !(mark === '*' && selected.startsWith('**'))) {
    const inner = selected.slice(mark.length, -mark.length);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  const body = selected || placeholder;
  const next = text.slice(0, start) + mark + body + mark + text.slice(end);
  return { text: next, start: start + mark.length, end: start + mark.length + body.length };
}

/** The bounds of the paragraph that holds the cursor: from after the previous blank line to before the next. */
function paragraphAt(text: string, cursor: number): { from: number; to: number } {
  const from = text.lastIndexOf('\n\n', Math.max(0, cursor - 1));
  const next = text.indexOf('\n\n', cursor);
  return { from: from < 0 ? 0 : from + 2, to: next < 0 ? text.length : next };
}

/** The kind of the paragraph that holds the cursor, from its prefix. */
export function paragraphKindAt(text: string, cursor: number): BlockKind {
  const { from, to } = paragraphAt(text, cursor);
  const paragraph = text.slice(from, to);
  return paragraph.startsWith('-# ') ? 'small' : paragraph.startsWith('+# ') ? 'large' : paragraph.startsWith('# ') ? 'title' : 'normal';
}

/** Makes the paragraph with the cursor a title, small or large text; the same kind again turns it back to a normal paragraph. */
export function setParagraphKind(text: string, cursor: number, kind: BlockKind): Edit {
  const { from, to } = paragraphAt(text, cursor);
  const paragraph = text.slice(from, to);
  const current = paragraphKindAt(text, cursor);
  const stripped = paragraph.slice(PREFIX[current].length);
  const prefix = current === kind ? '' : PREFIX[kind];
  const next = text.slice(0, from) + prefix + stripped + text.slice(to);
  const shift = prefix.length - PREFIX[current].length;
  const at = Math.max(from, cursor + shift);
  return { text: next, start: at, end: at };
}

/** A link: the selected words become its label (or a label to type over is put in), the address after it. */
export function makeLink(text: string, start: number, end: number, address: string, placeholder = 'link text'): Edit {
  const label = text.slice(start, end) || placeholder;
  const link = `[${label}](${address.trim()})`;
  return { text: text.slice(0, start) + link + text.slice(end), start: start + 1, end: start + 1 + label.length };
}

/** Puts something (a variable) in place of the selection and the cursor after it. */
export function insertAt(text: string, start: number, end: number, insert: string): Edit {
  return { text: text.slice(0, start) + insert + text.slice(end), start: start + insert.length, end: start + insert.length };
}

/** Whether an address is one the editor may link to: https, http or mailto, or a link variable. */
export function linkAddressProblem(address: string): string | null {
  const value = address.trim();
  if (!value) return 'Write the address the link goes to.';
  if (/^\{(link|terms|eventlink)\}$/i.test(value)) return null;
  if (/^(https?:\/\/|mailto:)[^\s()"<>]+$/i.test(value)) return null;
  return 'The address must start with https:// (or mailto:), or be {link}, {terms} or {eventlink}.';
}
