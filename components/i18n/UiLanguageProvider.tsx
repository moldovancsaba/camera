'use client';

/**
 * The language of the event's user interface for every client component below it (camera#352). The capture layout sets it from the event; a component
 * reads it with `useUiLanguage()` or gets the ready function from `useT()`. Outside a provider the language is English, so nothing changes where no
 * language was set. The page's own language is set on the document too, so screen readers and the browser's translate offer know it.
 */

import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { DEFAULT_UI_LANGUAGE, textOr, translate, type MessageKey, type MessageValues, type UiLanguage } from '@/lib/i18n';

const UiLanguageContext = createContext<UiLanguage>(DEFAULT_UI_LANGUAGE);

export default function UiLanguageProvider({ language, children }: { language: UiLanguage; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = language;
    return () => {
      root.lang = previous;
    };
  }, [language]);
  return <UiLanguageContext.Provider value={language}>{children}</UiLanguageContext.Provider>;
}

export const useUiLanguage = (): UiLanguage => useContext(UiLanguageContext);

export function useT() {
  const language = useUiLanguage();
  const t = useCallback((key: MessageKey, values?: MessageValues) => translate(language, key, values), [language]);
  const own = useCallback((key: MessageKey, stored: string | null | undefined, values?: MessageValues) => textOr(language, key, stored, values), [language]);
  return { t, own, language };
}
