'use client';

/**
 * The activity log (issue 517): who changed what and when, and every refused or failed request, mailed every Monday as a CSV to the owner. Global admins.
 */

import { GdsStack } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import ActivityLogCard from '@/components/admin/ActivityLogCard';

export default function ActivityLogPage() {
  return (
    <GdsStack gap="lg">
      <WorkspaceHeader
        eyebrow="Settings"
        title="Activity log"
        description="What the people who manage the service did and every refused or failed request, with who and when. The new records are mailed every Monday as a CSV; the ones the previous mail carried are deleted."
      />
      <ActivityLogCard />
    </GdsStack>
  );
}
