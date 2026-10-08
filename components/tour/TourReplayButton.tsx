'use client';

import { IconHelpCircle } from '@tabler/icons-react';
import { UnstyledButton } from '@/components/gds/PublicPrimitives';
import { clearTourSeen } from '@/lib/tour/storage';
import type { TourController } from '@/lib/tour/useTourController';
import { useT } from '@/components/i18n/UiLanguageProvider';

export default function TourReplayButton({
  tourId,
  controller,
  label,
}: {
  tourId: string;
  controller: TourController;
  label?: string;
}) {
  const { t } = useT();
  return (
    <UnstyledButton
      type="button"
      onClick={() => {
        clearTourSeen(tourId);
        controller.start();
      }}
      style={{ alignItems: 'center', color: 'inherit', display: 'inline-flex', gap: 6 }}
    >
      <IconHelpCircle size={16} />
      {label ?? t('tour.show')}
    </UnstyledButton>
  );
}
