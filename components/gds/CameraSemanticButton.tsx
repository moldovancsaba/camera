'use client';

import {
  SemanticButton as GdsSemanticButton,
  type SemanticButtonProps,
} from '@doneisbetter/gds-core/client';
import { cameraAdminVocabularyPacks } from '@/lib/gds/camera-admin-vocabulary';

export default function CameraSemanticButton({
  vocabularyPacks,
  ...props
}: SemanticButtonProps) {
  return (
    <GdsSemanticButton
      vocabularyPacks={[
        ...cameraAdminVocabularyPacks,
        ...(vocabularyPacks ?? []),
      ]}
      {...props}
    />
  );
}
