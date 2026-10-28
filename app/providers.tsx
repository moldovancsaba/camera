'use client';

import CameraGdsProvider from '@/components/gds/CameraGdsProvider';
import UiLanguageProvider from '@/components/i18n/UiLanguageProvider';
import type { UiLanguage } from '@/lib/i18n';

export default function Providers({ children, language, syncDocumentLanguage }: { children: React.ReactNode; language: UiLanguage; syncDocumentLanguage: boolean }) {
  return (
    <UiLanguageProvider language={language} syncDocumentLanguage={syncDocumentLanguage}>
      <CameraGdsProvider>{children}</CameraGdsProvider>
    </UiLanguageProvider>
  );
}
