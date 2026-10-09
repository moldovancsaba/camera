/**
 * The text levels of the dictionary (issue 353, docs/BUILDING_BRICKS.md steps 6, owner decisions 159 and 167): every default text of the user journey has a **global** wording (the code
 * dictionary, English and Hungarian), and an admin can set another wording for **all events of a partner** or for **one event**, per language. The chain is the one every brick
 * follows: the event's own, else the partner's, else the global wording set by an admin, else the code dictionary; nothing is copied down (a level stores only what an editor wrote,
 * and looks at the level above for the rest), and a wording written at a level is its own and is never overridden by a later change above.
 *
 * Plain text only (no `<` or `>`), at most 500 characters, and a text that has `{name}` markers must keep exactly the same markers, so a changed wording can never break the
 * place where a value is filled in. Pure; the stores are at the bottom and take the database as an argument. Unit-tested (overrides.test.ts).
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { en, type MessageKey } from '@/lib/i18n/messages.en';
import { UI_LANGUAGES, normalizeUiLanguage, type UiLanguage } from '@/lib/i18n';

export const TEXT_MAX = 500;

/** Wordings written at one level for one language: only the keys the editor changed. */
export type TextOverrides = Partial<Record<MessageKey, string>>;
/** Wordings written at one level, per language. */
export type TextsByLanguage = Partial<Record<UiLanguage, TextOverrides>>;

const KEYS = new Set<string>(Object.keys(en));
const MARKER = /\{(\w+)\}/g;

/** The `{name}` markers of a text, sorted, each once. */
export function markersOf(text: string): string[] {
  return [...new Set([...text.matchAll(MARKER)].map((match) => match[1]))].sort();
}

export type ParsedTexts = { ok: true; value: TextsByLanguage } | { ok: false; error: string };

/**
 * The wordings from a request: `{ en: { 'camera.takePhoto': 'Snap!' }, hu: { ... } }`. An empty text means "no wording at this level" and is left out. Refused with the reason:
 * an unknown language or key, something that is not text, a text over the limit, one with `<` or `>`, or one that does not keep the `{name}` markers of the dictionary text.
 */
export function parseTexts(input: unknown): ParsedTexts {
  if (input === null || input === undefined) return { ok: true, value: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'The texts are an object with a language at the top: { en: { ... }, hu: { ... } }.' };
  const out: TextsByLanguage = {};
  for (const [language, map] of Object.entries(input as Record<string, unknown>)) {
    if (!(UI_LANGUAGES as readonly string[]).includes(language)) return { ok: false, error: `Unknown language: ${language}.` };
    if (map === null || typeof map !== 'object' || Array.isArray(map)) return { ok: false, error: `The texts of ${language} must be an object of key and text.` };
    const texts: TextOverrides = {};
    for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
      if (!KEYS.has(key)) return { ok: false, error: `Unknown text: ${key}.` };
      if (typeof value !== 'string') return { ok: false, error: `The text ${key} must be text.` };
      const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (text.length > TEXT_MAX) return { ok: false, error: `The text ${key} is longer than ${TEXT_MAX} characters.` };
      if (/[<>]/.test(text)) return { ok: false, error: `The text ${key} must be plain text: no < or >.` };
      const wanted = markersOf(en[key as MessageKey]);
      const given = markersOf(text);
      if (wanted.join() !== given.join()) return { ok: false, error: `The text ${key} must keep ${wanted.length ? wanted.map((name) => `{${name}}`).join(', ') : 'no {markers}'}, as the dictionary text does.` };
      texts[key as MessageKey] = text;
    }
    if (Object.keys(texts).length > 0) out[language as UiLanguage] = texts;
  }
  return { ok: true, value: out };
}

/** Layers of one language, lowest first: a later layer's wording wins. */
export function mergeOverrides(...layers: Array<TextOverrides | null | undefined>): TextOverrides {
  return Object.assign({}, ...layers.filter(Boolean));
}

/** The wordings for one language from several levels, lowest first (global, partner, event). */
export function overridesFor(language: UiLanguage, ...levels: Array<TextsByLanguage | null | undefined>): TextOverrides {
  return mergeOverrides(...levels.map((level) => level?.[language]));
}

/** What a stored value amounts to: only languages and keys that are still in the dictionary, only text. A stored value is never trusted more than a request. */
export function storedTexts(value: unknown): TextsByLanguage {
  const parsed = parseTexts(value);
  if (parsed.ok) return parsed.value;
  // A stored wording that no longer passes (a key was renamed, a marker added) is dropped one by one rather than losing the rest.
  const out: TextsByLanguage = {};
  for (const language of UI_LANGUAGES) {
    const map = (value as Record<string, unknown> | null | undefined)?.[language];
    if (!map || typeof map !== 'object') continue;
    const kept: TextOverrides = {};
    for (const [key, text] of Object.entries(map as Record<string, unknown>)) {
      const one = parseTexts({ [language]: { [key]: text } });
      if (one.ok) Object.assign(kept, one.value[language]);
    }
    if (Object.keys(kept).length > 0) out[language] = kept;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The stores
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const GLOBAL_SETTING = 'dictionary';

/** The global wordings an admin set (above the code dictionary). */
export async function getGlobalTexts(db: Db): Promise<TextsByLanguage> {
  const stored = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: GLOBAL_SETTING });
  return storedTexts(stored?.texts);
}

export async function saveGlobalTexts(db: Db, texts: TextsByLanguage, updatedBy: string | null, now: string): Promise<void> {
  await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne({ settingId: GLOBAL_SETTING }, { $set: { settingId: GLOBAL_SETTING, texts, updatedAt: now, updatedBy } }, { upsert: true });
}

export async function savePartnerTexts(db: Db, partnerId: string, texts: TextsByLanguage, now: string): Promise<boolean> {
  const result = await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId }, { $set: { texts, updatedAt: now } });
  return result.matchedCount > 0;
}

export async function saveEventTexts(db: Db, eventId: string, texts: TextsByLanguage, now: string): Promise<boolean> {
  const result = await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId }, { $set: { texts, updatedAt: now } });
  return result.matchedCount > 0;
}

export interface EventTexts {
  language: UiLanguage;
  /** What the event's users see instead of the code dictionary: global, then the partner's, then the event's own, merged for the event's language. */
  overrides: TextOverrides;
  /** The levels as they are stored, for the editors: what each level wrote, and what it takes from above. */
  levels: { global: TextsByLanguage; partner: TextsByLanguage; event: TextsByLanguage };
}

/** The wordings that apply to an event, level by level and merged. Two reads (the global setting and the partner), none when nothing was ever written. */
export async function loadEventTexts(db: Db, event: Document, partner?: Document | null): Promise<EventTexts> {
  const language = normalizeUiLanguage(event.uiLanguage);
  const partnerDoc = partner === undefined ? (typeof event.partnerId === 'string' && event.partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId }) : null) : partner;
  const levels = { global: await getGlobalTexts(db), partner: storedTexts(partnerDoc?.texts), event: storedTexts(event.texts) };
  return { language, overrides: overridesFor(language, levels.global, levels.partner, levels.event), levels };
}
