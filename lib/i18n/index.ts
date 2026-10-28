/** Canonical UI locales and message dictionaries shared by server and client. */

import { en, type MessageKey } from '@/lib/i18n/messages.en';
import { hu } from '@/lib/i18n/messages.hu';
import { de } from '@/lib/i18n/messages.de';
import { it } from '@/lib/i18n/messages.it';
import { ptBR } from '@/lib/i18n/messages.pt-BR';
import { ptPT } from '@/lib/i18n/messages.pt-PT';
import { es } from '@/lib/i18n/messages.es';
import { fr } from '@/lib/i18n/messages.fr';
import { ru } from '@/lib/i18n/messages.ru';
import { zhHans } from '@/lib/i18n/messages.zh-Hans';
import { zhHant } from '@/lib/i18n/messages.zh-Hant';
import { ro } from '@/lib/i18n/messages.ro';
import { pl } from '@/lib/i18n/messages.pl';
import { sk } from '@/lib/i18n/messages.sk';
import { hr } from '@/lib/i18n/messages.hr';
import { sl } from '@/lib/i18n/messages.sl';
import { bg } from '@/lib/i18n/messages.bg';
import { tr } from '@/lib/i18n/messages.tr';
import { ar } from '@/lib/i18n/messages.ar';
import { hi } from '@/lib/i18n/messages.hi';
import { ka } from '@/lib/i18n/messages.ka';
import { srCyrl } from '@/lib/i18n/messages.sr-Cyrl';
import { srLatn } from '@/lib/i18n/messages.sr-Latn';
import type { TextOverrides } from '@/lib/i18n/overrides';

export const UI_LANGUAGES = [
  'en', 'hu', 'de', 'it', 'pt-BR', 'pt-PT', 'es', 'fr', 'ru', 'zh-Hans', 'zh-Hant',
  'ro', 'pl', 'sk', 'hr', 'sl', 'bg', 'tr', 'ar', 'hi', 'ka', 'sr-Cyrl', 'sr-Latn',
] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export const DEFAULT_UI_LANGUAGE: UiLanguage = 'en';
export const UI_LANGUAGE_LABELS: Record<UiLanguage, string> = {
  en: 'English', hu: 'Magyar', de: 'Deutsch', it: 'Italiano', 'pt-BR': 'Português (Brasil)', 'pt-PT': 'Português (Portugal)',
  es: 'Español', fr: 'Français', ru: 'Русский', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', ro: 'Română', pl: 'Polski',
  sk: 'Slovenčina', hr: 'Hrvatski', sl: 'Slovenščina', bg: 'Български', tr: 'Türkçe', ar: 'العربية', hi: 'हिन्दी', ka: 'ქართული',
  'sr-Cyrl': 'Српски (ћирилица)', 'sr-Latn': 'Srpski (latinica)',
};

export type { MessageKey };

export const DICTIONARIES: Record<UiLanguage, Record<MessageKey, string>> = {
  en, hu, de, it, 'pt-BR': ptBR, 'pt-PT': ptPT, es, fr, ru, 'zh-Hans': zhHans, 'zh-Hant': zhHant,
  ro, pl, sk, hr, sl, bg, tr, ar, hi, ka, 'sr-Cyrl': srCyrl, 'sr-Latn': srLatn,
};

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
  const hasOverride = overrides !== null && overrides !== undefined && Object.prototype.hasOwnProperty.call(overrides, key);
  const text = hasOverride ? overrides[key] ?? '' : DICTIONARIES[language][key] ?? en[key];
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
