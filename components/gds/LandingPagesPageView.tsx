'use client';

import Link from 'next/link';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import {
  AdminResourceEmptyState,
  AdminResourceManager,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@sovereignsquad/gds-admin/client';
import { getStatusChipContent } from '@/lib/gds/statusChipContent';

export interface SerializedLandingPageRow {
  id: string;
  slug: string;
  title?: string | null;
  eventMongoId: string;
  eventName: string;
  targetType: 'slideshow' | 'layout';
  targetName: string;
  isActive: boolean;
  updatedAtLabel: string;
  partnerName?: string | null;
}

export default function LandingPagesPageView({
  landingPages,
  search,
  partnerFilter,
  dbError,
}: {
  landingPages: SerializedLandingPageRow[];
  search: string;
  partnerFilter: string;
  dbError?: MongoConnectionDiagnosis | null;
}) {
  const records: Array<AdminResourceRecord & SerializedLandingPageRow> = landingPages.map((page) => ({
    ...page,
    id: page.id,
    title: page.title?.trim() || page.slug,
    description: `/landing/${page.slug}`,
    status: getStatusChipContent({ tone: page.isActive ? 'active' : 'inactive' }),
    metadata: [
      { label: 'Partner', value: page.partnerName || 'Unknown partner' },
      { label: 'Event', value: page.eventName },
      { label: 'Target', value: `${page.targetType === 'layout' ? 'Layout' : 'Slideshow'}: ${page.targetName}` },
      { label: 'Updated', value: page.updatedAtLabel },
    ],
  }));
  // GDS AdminResourceCard renders every non-danger primary/secondary action with
  // the "edit" label, and ignores onPreview when a primary action exists. To avoid
  // multiple identical "Edit" buttons we keep no primary action (the public landing
  // page opens via onPreview's Preview affordance), a single 'edit' secondary, and
  // "Open Event" as an icon action (its own slot).
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedLandingPageRow>> = [
    {
      id: 'edit',
      label: 'Edit',
      kind: 'secondary',
      onSelect: (page) => {
        window.location.href = `/admin/events/${page.eventMongoId}/landing-pages/${page.id}`;
      },
    },
    {
      id: 'event',
      label: 'Open Event',
      kind: 'icon',
      onSelect: (page) => {
        window.location.href = `/admin/events/${page.eventMongoId}`;
      },
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
      <WorkspaceHeader
        eyebrow="Resource Inventory"
        title="Landing Pages"
      />

      <section
        style={{
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: 'var(--mantine-radius-md)',
          padding: 'var(--mantine-spacing-md)',
        }}
      >
        <form>
          <div style={{ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-sm)' }}>
            <label style={{ display: 'grid', flex: '1 1 280px', gap: 6, fontWeight: 600 }}>
              Search
              <input
              name="search"
              defaultValue={search}
              placeholder="Search slug, title, event, or embedded target"
                style={{ border: '1px solid var(--mantine-color-gray-4)', borderRadius: 8, padding: '10px 12px' }}
              />
            </label>
            <label style={{ display: 'grid', flex: '0 1 260px', gap: 6, fontWeight: 600 }}>
              Partner
              <input
              name="partner"
              defaultValue={partnerFilter}
              placeholder="Exact partner name filter"
                style={{ border: '1px solid var(--mantine-color-gray-4)', borderRadius: 8, padding: '10px 12px' }}
              />
            </label>
            <button type="submit">Search</button>
            {search || partnerFilter ? (
              <Link href="/admin/landing-pages">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}

      {!dbError && landingPages.length === 0 ? (
        <AdminResourceEmptyState
            title="No landing pages found"
            description="Create a landing page from an event workspace, then manage and audit it here."
          />
      ) : null}

      {!dbError && landingPages.length > 0 ? (
        <AdminResourceManager
          records={records}
          state="ready"
          actions={actions}
          onPreview={(page) => {
            window.open(`/landing/${page.slug}`, '_blank', 'noopener,noreferrer');
          }}
        />
      ) : null}
    </div>
  );
}
