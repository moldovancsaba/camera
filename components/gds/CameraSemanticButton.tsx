'use client';

import {
  SemanticButton as GdsSemanticButton,
  type SemanticButtonProps,
} from '@sovereignsquad/gds-core/client';
import { cameraAdminVocabularyPacks } from '@/lib/gds/camera-admin-vocabulary';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

export default function CameraSemanticButton({
  vocabularyPacks,
  ...props
}: SemanticButtonProps) {
  const language = useUiLanguage();
  const direction = uiLanguageDirection(language);
  const sourceVocabulary = [
    ...cameraAdminVocabularyPacks,
    ...(vocabularyPacks ?? []),
  ];
  const actionTranslation = sourceVocabulary.some((pack) => {
    const action = (pack.actions as Record<string, { defaultMessage: string }>)[props.action];
    return action !== undefined && adminOperationText(action.defaultMessage, language) !== action.defaultMessage;
  });
  const localizedVocabulary = sourceVocabulary.map((pack) => ({
      ...pack,
      actions: Object.fromEntries(Object.entries(pack.actions).map(([id, action]) => [
        id,
        { ...action, defaultMessage: adminOperationText(action.defaultMessage, language) },
      ])),
    }));
  return (
    <GdsSemanticButton
      vocabularyPacks={localizedVocabulary}
      {...props}
      lang={actionTranslation ? language : props.lang}
      dir={actionTranslation ? direction : props.dir}
    >
      {props.children}
    </GdsSemanticButton>
  );
}
