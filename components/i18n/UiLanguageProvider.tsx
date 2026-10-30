'use client';

/**
 * The resolved language of every client component below it (camera#352). Capture/share layouts resolve the device preference and partner/event fallback; a component
 * reads it with `useUiLanguage()` or gets the ready function from `useT()`. The
 * root layout resolves the device locale for app chrome and the event/partner
 * fallback for capture and share screens. The document language and direction
 * are kept in sync for screen readers and browser translation tools.
 */

import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { DEFAULT_UI_LANGUAGE, textOr, translate, type MessageKey, type MessageValues, type UiLanguage } from '@/lib/i18n';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';
import type { TextOverrides } from '@/lib/i18n/overrides';

const UiLanguageContext = createContext<UiLanguage>(DEFAULT_UI_LANGUAGE);
const UiLanguageSetterContext = createContext<Dispatch<SetStateAction<UiLanguage>>>(() => undefined);
/** The wordings an admin wrote for the event's partner or for the event, in its language (lib/i18n/overrides.ts); none outside a provider. */
const UiTextsContext = createContext<TextOverrides | null>(null);

export default function UiLanguageProvider({ language, texts = null, syncDocumentLanguage = true, children }: { language: UiLanguage; texts?: TextOverrides | null; syncDocumentLanguage?: boolean; children: ReactNode }) {
  const [activeLanguage, setActiveLanguage] = useState(language);
  useEffect(() => setActiveLanguage(language), [language]);
  useEffect(() => {
    if (!syncDocumentLanguage) return;
    const root = document.documentElement;
    const previous = root.lang;
    const previousDirection = root.dir;
    root.lang = activeLanguage;
    root.dir = uiLanguageDirection(activeLanguage);
    return () => {
      root.lang = previous;
      root.dir = previousDirection;
    };
  }, [activeLanguage, syncDocumentLanguage]);
  return (
    <UiLanguageSetterContext.Provider value={setActiveLanguage}>
      <UiLanguageContext.Provider value={activeLanguage}>
        <UiTextsContext.Provider value={texts}>{children}</UiTextsContext.Provider>
      </UiLanguageContext.Provider>
    </UiLanguageSetterContext.Provider>
  );
}

export const useUiLanguage = (): UiLanguage => useContext(UiLanguageContext);
/** Change the current interface locale after a preference has been saved. */
export const useSetUiLanguage = (): Dispatch<SetStateAction<UiLanguage>> => useContext(UiLanguageSetterContext);
/** The wordings written for the event's partner or the event (null when none or outside a provider), for the helpers that take them as an argument. */
export const useUiTexts = (): TextOverrides | null => useContext(UiTextsContext);

export function useT() {
  const language = useUiLanguage();
  const texts = useContext(UiTextsContext);
  const t = useCallback((key: MessageKey, values?: MessageValues) => translate(language, key, values, texts), [language, texts]);
  const own = useCallback((key: MessageKey | readonly MessageKey[], stored: string | null | undefined, values?: MessageValues) => textOr(language, key, stored, values, texts), [language, texts]);
  return { t, own, language };
}
