import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES, type UiLanguage } from '@/lib/i18n';

export interface LanguagePreference {
  tag: string;
  quality: number;
  order: number;
}

/** Parse Accept-Language once, honoring quality weights and original order for ties. */
export function parseAcceptLanguage(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part, order): LanguagePreference | null => {
      const [rawTag, ...parameters] = part.trim().split(';');
      const tag = rawTag?.trim();
      if (!tag || tag === '*') return null;
      let quality = 1;
      let sawQuality = false;
      for (const parameter of parameters) {
        if (!/^\s*q\s*=/i.test(parameter)) continue;
        // A malformed or repeated q parameter must not silently turn a low-priority
        // preference into q=1 and override the user's actual language order.
        if (sawQuality) return null;
        sawQuality = true;
        const match = /^\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/i.exec(parameter);
        if (!match) return null;
        quality = Number(match[1]);
      }
      if (!Number.isFinite(quality) || quality <= 0) return null;
      return { tag, quality, order };
    })
    .filter((entry): entry is LanguagePreference => entry !== null)
    .sort((a, b) => b.quality - a.quality || a.order - b.order)
    .map(({ tag }) => tag);
}

function canonicalParts(tag: string): Intl.Locale | null {
  try {
    return new Intl.Locale(tag.replace(/_/g, '-'));
  } catch {
    return null;
  }
}

/**
 * Match one device preference without crossing scripts. The supported list is the
 * single source of truth; country/script aliases are explicit so that Chinese and
 * Serbian never silently switch writing systems.
 */
export function matchUiLanguage(tag: string, supported: readonly UiLanguage[] = UI_LANGUAGES): UiLanguage | null {
  const locale = canonicalParts(tag);
  if (!locale) return null;
  const canonical = locale.toString();
  const byLowercase = new Map(supported.map((language) => [language.toLowerCase(), language]));
  const exact = byLowercase.get(canonical.toLowerCase());
  if (exact) return exact;

  const language = locale.language.toLowerCase();
  const script = locale.script?.toLowerCase();
  const region = locale.region?.toUpperCase();
  const explicit: string[] = [];

  if (language === 'zh') {
    if (script === 'hant' || ['TW', 'HK', 'MO'].includes(region ?? '')) explicit.push('zh-Hant');
    else explicit.push('zh-Hans');
  } else if (language === 'sr') {
    explicit.push(script === 'latn' ? 'sr-Latn' : 'sr-Cyrl');
  } else if (language === 'pt') {
    explicit.push(region === 'PT' ? 'pt-PT' : 'pt-BR');
  } else if (script) {
    explicit.push(`${language}-${script}`);
  }

  for (const candidate of explicit) {
    const match = byLowercase.get(candidate.toLowerCase());
    if (match) return match;
  }

  // Match a generic base language only when the configured catalog is exactly that base.
  const base = byLowercase.get(language);
  if (base) return base;

  // For languages with only one configured region/script variant, that variant is safe.
  const variants = supported.filter((item) => item.toLowerCase().startsWith(`${language}-`));
  if (variants.length === 1 && language !== 'zh' && language !== 'sr' && language !== 'pt') return variants[0];
  return null;
}

/** First supported device preference in browser order. */
export function deviceUiLanguage(preferences: readonly string[] | null | undefined): UiLanguage | null {
  for (const preference of preferences ?? []) {
    if (typeof preference !== 'string') continue;
    const matched = matchUiLanguage(preference);
    if (matched) return matched;
  }
  return null;
}

/** Partner language is the configured fallback; event language is used only if the partner has none. */
export function configuredUiLanguage(
  eventLanguage: unknown,
  partnerLanguage: unknown,
): UiLanguage {
  if (typeof partnerLanguage === 'string' && UI_LANGUAGES.includes(partnerLanguage as UiLanguage)) {
    return partnerLanguage as UiLanguage;
  }
  if (typeof eventLanguage === 'string' && UI_LANGUAGES.includes(eventLanguage as UiLanguage)) {
    return eventLanguage as UiLanguage;
  }
  return DEFAULT_UI_LANGUAGE;
}

/** Device preference first, then partner fallback, then event fallback, then English. */
export function resolveUiLanguage(
  preferences: readonly string[] | null | undefined,
  eventLanguage: unknown,
  partnerLanguage: unknown,
): UiLanguage {
  return deviceUiLanguage(preferences) ?? configuredUiLanguage(eventLanguage, partnerLanguage);
}

export function uiLanguageDirection(language: UiLanguage): 'ltr' | 'rtl' {
  return language === 'ar' ? 'rtl' : 'ltr';
}
