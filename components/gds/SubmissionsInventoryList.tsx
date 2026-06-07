'use client';

import {
  AdminResourceEmptyState,
  AdminResourceManager,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@doneisbetter/gds-admin/client';

export interface SerializedSubmissionRow {
  id: string;
  imageUrl: string;
  userName: string;
  userEmail: string;
  frameName?: string | null;
  createdAtLabel: string;
  playCount?: number;
  partnerAdminId?: string | null;
  partnerName?: string | null;
  eventAdminId?: string | null;
  eventName?: string | null;
}

function isLegacyGuestName(value: string): boolean {
  return value.trim().toLowerCase() === 'event guest';
}

function resolveDisplayName(userName: string): string {
  const normalized = userName.trim();
  return normalized && !isLegacyGuestName(normalized) ? normalized : 'Guest';
}

export default function SubmissionsInventoryList({
  submissions,
}: {
  submissions: SerializedSubmissionRow[];
  totalCount: number;
}) {
  const records: Array<AdminResourceRecord & SerializedSubmissionRow> = submissions.map((submission) => {
    const displayName = resolveDisplayName(submission.userName);
    return {
      ...submission,
      id: submission.id,
      title: displayName,
      description: submission.eventName || submission.partnerName || submission.frameName || 'Gallery item',
      mediaSrc: submission.imageUrl,
      mediaAlt: `Photo by ${displayName}`,
      metadata: [
        { label: 'Email', value: submission.userEmail },
        { label: 'Frame', value: submission.frameName || 'frameless' },
        { label: 'Created', value: submission.createdAtLabel },
        submission.partnerName ? { label: 'Partner', value: submission.partnerName } : null,
        submission.eventName ? { label: 'Event', value: submission.eventName } : null,
        typeof submission.playCount === 'number' && submission.playCount > 0
          ? { label: 'Slideshow plays', value: String(submission.playCount) }
          : null,
      ].filter((item): item is { label: string; value: string } => Boolean(item)),
    };
  });
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedSubmissionRow>> = [
    {
      id: 'view',
      label: 'View',
      kind: 'primary',
      onSelect: (submission) => {
        window.location.href = `/share/${submission.id}`;
      },
    },
    {
      id: 'download',
      label: 'Download',
      kind: 'secondary',
      onSelect: (submission) => {
        window.open(submission.imageUrl, '_blank', 'noopener,noreferrer');
      },
    },
  ];

  if (submissions.length === 0) {
    return (
      <AdminResourceEmptyState
          title="No gallery items yet"
          description="Waiting for users to create their first photos!"
        />
    );
  }

  return <AdminResourceManager records={records} state="ready" actions={actions} />;
}
