'use client';

/**
 * The frames of the events, the general level (issue 502, docs/FRAME_SLOTS_PLAN.md segment 5; owner answer 220): the slots every generated frame is composed of until a partner or an event sets
 * its own. Global admins.
 */

import { GdsStack } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import DefaultSlotsPanel from '@/components/admin/DefaultSlotsPanel';

export default function GeneralFrameSlotsPage() {
  return (
    <GdsStack gap="lg">
      <WorkspaceHeader
        eyebrow="Settings"
        title="Frame slots"
        description="The slots every generated frame is composed of: up to six texts and six pictures, each optional. Every event follows these until its partner sets default slots, or the event sets slots of its own. Nothing is copied to the events: a change here is read by all that follow, and their images are drawn again."
      />
      <DefaultSlotsPanel level={{ scope: 'global' }} />
    </GdsStack>
  );
}
