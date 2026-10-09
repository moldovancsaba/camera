/**
 * The language of the user interface of an event (camera#352): English by default, Hungarian for MTK. The event has one `uiLanguage`; every default text
 * of the journey comes from the dictionary of that language, and a text an editor wrote for the event wins (main rule 18). Pure and DOM-free; used by
 * server and client code alike (the client reads the language from the context set in the capture layout, components/i18n/UiLanguageProvider.tsx).
 */

import { en, type MessageKey } from '@/lib/i18n/messages.en';
import { hu } from '@/lib/i18n/messages.hu';
import type { TextOverrides } from '@/lib/i18n/overrides';

export const UI_LANGUAGES = ['en', 'hu'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export const DEFAULT_UI_LANGUAGE: UiLanguage = 'en';
export const UI_LANGUAGE_LABELS: Record<UiLanguage, string> = { en: 'English', hu: 'Magyar (Hungarian)' };

export type { MessageKey };

const DICTIONARIES: Record<UiLanguage, Record<MessageKey, string>> = { en, hu };

/** A stored language, or English when it is missing or not one we have. */
export function normalizeUiLanguage(value: unknown): UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value) ? (value as UiLanguage) : DEFAULT_UI_LANGUAGE;
}

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value);
}

export type MessageValues = Record<string, string | number>;

/**
 * The text in the language; `{name}` markers are replaced by the matching value (a marker with no value stays as it is). `overrides` are the wordings an admin wrote for the partner or
 * the event in this language (lib/i18n/overrides.ts); a key they do not have uses the code dictionary.
 */
export function translate(language: UiLanguage, key: MessageKey, values?: MessageValues, overrides?: TextOverrides | null): string {
  const text = overrides?.[key] ?? DICTIONARIES[language][key] ?? en[key];
  return values ? text.replace(/\{(\w+)\}/g, (marker, name: string) => (name in values ? String(values[name]) : marker)) : text;
}

/**
 * A text an editor may have set: the editor's own text when there is one, else the dictionary text. The settings editors saved before the language
 * existed hold the English default as if it were their own (the page editor pre-fills and saves the defaults), so in another language a stored text that
 * is exactly the English default counts as not set, and the language's own text shows instead. Several keys may be given when the editor seeded more than one English
 * wording for the same field; the first key is the text shown.
 */
export function textOr(language: UiLanguage, key: MessageKey | readonly MessageKey[], stored: string | null | undefined, values?: MessageValues, overrides?: TextOverrides | null): string {
  const keys = Array.isArray(key) ? (key as readonly MessageKey[]) : [key as MessageKey];
  const own = typeof stored === 'string' ? stored.trim() : '';
  const isEnglishDefault = keys.some((candidate) => own === translate(DEFAULT_UI_LANGUAGE, candidate, values));
  if (own && (language === DEFAULT_UI_LANGUAGE || !isEnglishDefault)) return stored as string;
  return translate(language, keys[0], values, overrides);
}
