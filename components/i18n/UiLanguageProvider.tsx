'use client';

/**
 * The language of the event's user interface for every client component below it (camera#352). The capture layout sets it from the event; a component
 * reads it with `useUiLanguage()` or gets the ready function from `useT()`. Outside a provider the language is English, so nothing changes where no
 * language was set. The page's own language is set on the document too, so screen readers and the browser's translate offer know it.
 */

import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { DEFAULT_UI_LANGUAGE, textOr, translate, type MessageKey, type MessageValues, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';

const UiLanguageContext = createContext<UiLanguage>(DEFAULT_UI_LANGUAGE);
/** The wordings an admin wrote for the event's partner or for the event, in its language (lib/i18n/overrides.ts); none outside a provider. */
const UiTextsContext = createContext<TextOverrides | null>(null);

export default function UiLanguageProvider({ language, texts = null, children }: { language: UiLanguage; texts?: TextOverrides | null; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = language;
    return () => {
      root.lang = previous;
    };
  }, [language]);
  return (
    <UiLanguageContext.Provider value={language}>
      <UiTextsContext.Provider value={texts}>{children}</UiTextsContext.Provider>
    </UiLanguageContext.Provider>
  );
}

export const useUiLanguage = (): UiLanguage => useContext(UiLanguageContext);
/** The wordings written for the event's partner or the event (null when none or outside a provider), for the helpers that take them as an argument. */
export const useUiTexts = (): TextOverrides | null => useContext(UiTextsContext);

export function useT() {
  const language = useUiLanguage();
  const texts = useContext(UiTextsContext);
  const t = useCallback((key: MessageKey, values?: MessageValues) => translate(language, key, values, texts), [language, texts]);
  const own = useCallback((key: MessageKey | readonly MessageKey[], stored: string | null | undefined, values?: MessageValues) => textOr(language, key, stored, values, texts), [language, texts]);
  return { t, own, language };
}
