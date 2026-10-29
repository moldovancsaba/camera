import { DEFAULT_UI_LANGUAGE, type UiLanguage } from './index';

export interface InitialUiLanguages {
  /** Language of the full document, matching all route copy rendered inside it. */
  documentLanguage: UiLanguage;
  /** Device-first locale for translated regions/components on any route. */
  interfaceLanguage: UiLanguage;
}

/**
 * Keep global document metadata truthful while route families are migrated.
 * Public capture/share pages are localized as a whole; other routes remain
 * English at document level, while individually localized regions can opt in
 * with their own `lang` and `dir` attributes.
 */
export function initialUiLanguagesForPath(
  pathname: string,
  deviceLanguage: UiLanguage | null,
  configuredFallback: UiLanguage | null = null,
  adminPreference: UiLanguage | null = null,
): InitialUiLanguages {
  const localizedPage = /^\/(capture|share)\//.test(pathname);
  if (localizedPage) {
    const language = deviceLanguage ?? configuredFallback ?? DEFAULT_UI_LANGUAGE;
    return { documentLanguage: language, interfaceLanguage: language };
  }
  // Admin pages resolve a signed-in user's saved preference before the
  // browser fallback; the login page remains device-language first.
  const authenticatedAdminPage = /^\/admin(?:\/|$)/.test(pathname) && !/^\/admin\/login(?:\/|$)/.test(pathname);
  if (authenticatedAdminPage) {
    const language = adminPreference ?? deviceLanguage ?? DEFAULT_UI_LANGUAGE;
    return { documentLanguage: language, interfaceLanguage: language };
  }
  return {
    documentLanguage: DEFAULT_UI_LANGUAGE,
    interfaceLanguage: deviceLanguage ?? DEFAULT_UI_LANGUAGE,
  };
}
