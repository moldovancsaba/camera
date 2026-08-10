'use client';

import {
  AdminResourceEmptyState,
  AdminResourceManager,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@sovereignsquad/gds-admin/client';

export interface SerializedSubmissionRow {
  id: string;
  imageUrl: string;
  previewImageUrl?: string | null;
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

function resolveDisplayName(userName: string | null | undefined): string {
  // Defensive: some submission docs (e.g. anonymous/legacy or worker-created rows)
  // have no userName, so guard before calling string methods to avoid an RSC
  // render crash on the admin submissions page.
  const normalized = (userName ?? '').trim();
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
      mediaSrc: submission.previewImageUrl || submission.imageUrl,
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
  // WHAT: 'view' isn't a primary/secondary action, and 'download' is an icon
  //     action, not a second secondary.
  // WHY: GDS AdminResourceCard forces every non-danger primary/secondary
  //     action to the "edit" semantic (fixed id, ignores our custom label) --
  //     with both as text actions, "View" and "Download" rendered as two
  //     identical "Edit" buttons, neither of which actually edits anything.
  //     Viewing goes through onPreview below (its own "Preview" affordance);
  //     download becomes an icon action so it isn't mislabelled "Edit"
  //     either. Same pattern as EventsInventoryList.tsx / TryOnSuitsInventoryList.tsx.
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedSubmissionRow>> = [
    {
      id: 'download',
      label: 'Download',
      kind: 'icon',
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

  return (
    <AdminResourceManager
      records={records}
      state="ready"
      actions={actions}
      onPreview={(submission) => {
        window.location.href = `/share/${submission.id}`;
      }}
    />
  );
}
