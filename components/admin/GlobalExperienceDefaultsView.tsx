'use client';

import { GdsStack } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import ExperienceTemplateDefaultSettings from '@/components/admin/ExperienceTemplateDefaultSettings';

export default function GlobalExperienceDefaultsView() {
  return (
    <GdsStack gap="lg">
      <WorkspaceHeader eyebrow="Settings" title="Experience defaults" />
      <ExperienceTemplateDefaultSettings level="global" />
    </GdsStack>
  );
}
