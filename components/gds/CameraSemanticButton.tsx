'use client';

import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import {
  SemanticButton as GdsSemanticButton,
  type SemanticButtonProps,
} from '@sovereignsquad/gds-core/client';
import { cameraAdminVocabularyPacks } from '@/lib/gds/camera-admin-vocabulary';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

function localizeNode(value: ReactNode, language: ReturnType<typeof useUiLanguage>): ReactNode {
  return Children.map(value, (child) => {
    if (typeof child === 'string') return adminOperationText(child, language);
    if (!isValidElement<{ children?: ReactNode }>(child) || child.props.children === undefined) return child;
    return cloneElement(child, undefined, localizeNode(child.props.children, language));
  });
}

export default function CameraSemanticButton({
  vocabularyPacks,
  ...props
}: SemanticButtonProps) {
  const language = useUiLanguage();
  const direction = uiLanguageDirection(language);
  const localizePack = (pack: (typeof cameraAdminVocabularyPacks)[number]) => ({
    ...pack,
    actions: Object.fromEntries(Object.entries(pack.actions).map(([id, action]) => [
      id,
      { ...action, defaultMessage: adminOperationText(action.defaultMessage, language) },
    ])),
  });
  const localizedVocabulary = [
    ...cameraAdminVocabularyPacks.map(localizePack),
    ...(vocabularyPacks ?? []).map((pack) => ({
      ...pack,
      actions: Object.fromEntries(Object.entries(pack.actions).map(([id, action]) => [
        id,
        { ...action, defaultMessage: adminOperationText(action.defaultMessage, language) },
      ])),
    })),
  ];
  const translatedChildren = localizeNode(props.children, language);
  const translated = typeof props.children === 'string' && translatedChildren !== props.children;
  return (
    <GdsSemanticButton
      vocabularyPacks={localizedVocabulary}
      {...props}
      lang={translated ? language : props.lang}
      dir={translated ? direction : props.dir}
    >
      {translatedChildren}
    </GdsSemanticButton>
  );
}
