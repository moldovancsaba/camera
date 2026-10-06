/**
 * The emoji of an event, used as the logo of the generated frame when the partner has no logo (owner, 2026-10-06, camera#274).
 * Event names carry one more often than not ("⚽ DVTK x Kazincbarcika", "[🏀] FIBA U20 - Day I", "🏍️ MotoGP - Balatonpark Circuit").
 * Pure, so it is unit-tested (emoji.test.ts); the drawing is in render.ts.
 */

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/**
 * A grapheme that is an emoji as people see it: a picture by default (⚽), a symbol made a picture by the emoji selector (🏍️, ❤️),
 * a joined sequence (👨‍👩‍👧), a flag or a keycap. A plain ©, ™ or digit is text, not an emoji.
 */
export function isEmojiGrapheme(grapheme: string): boolean {
  if (/^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(grapheme)) return true;
  if (/^[#*0-9]️?⃣$/u.test(grapheme)) return true;
  if (!/\p{Extended_Pictographic}/u.test(grapheme)) return false;
  return /\p{Emoji_Presentation}/u.test(grapheme) || /️/u.test(grapheme) || /‍/u.test(grapheme);
}

/** The first emoji in a text, whole (a flag, a joined sequence or a symbol with its selector stays in one piece), or null. */
export function firstEmoji(text: string | null | undefined): string | null {
  if (!text) return null;
  const graphemes = segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
  return graphemes.find(isEmojiGrapheme) ?? null;
}

/**
 * The name without the emoji that is drawn as the logo, so it is not shown twice: "⚽ DVTK x Kazincbarcika" becomes
 * "DVTK x Kazincbarcika", "[🏀] FIBA U20 - Day I" becomes "FIBA U20 - Day I" (an emoji in brackets takes them with it). A name that
 * would be left empty stays as it is.
 */
export function withoutEmoji(name: string, emoji: string | null): string {
  if (!emoji) return name;
  const at = name.indexOf(emoji);
  if (at < 0) return name;
  let before = name.slice(0, at);
  let after = name.slice(at + emoji.length);
  const open = /[[(]\s*$/.exec(before);
  const close = /^\s*[\])]/.exec(after);
  if (open && close) {
    before = before.slice(0, open.index);
    after = after.slice(close[0].length);
  }
  return `${before} ${after}`.replace(/\s{2,}/g, ' ').trim() || name;
}

/** The emoji that stands for an event: the first in its name, else in the home or visitor team name, else in the partner's name. */
export function eventEmoji(event: { name?: string | null; homeTeam?: { name?: string | null } | null; visitorTeam?: { name?: string | null } | null }, partnerName?: string | null): string | null {
  return firstEmoji(event.name) ?? firstEmoji(event.homeTeam?.name) ?? firstEmoji(event.visitorTeam?.name) ?? firstEmoji(partnerName);
}
