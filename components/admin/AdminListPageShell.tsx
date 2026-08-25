'use client';

import Link from 'next/link';
import { StatsStrip } from '@sovereignsquad/gds-admin/client';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { DataToolbar as GdsDataToolbar } from '@sovereignsquad/gds-core/client';
import { AdminIcon } from '@/lib/gds/admin-icon-key';
import type { AdminIconKey } from '@/lib/gds/admin-icon-key';
import type { CameraStatItem } from '@/lib/gds/presentation';

export interface AdminListPageShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: string;
  primaryAction?: { href: string; label: string; iconKey?: AdminIconKey };
  stats?: CameraStatItem[];
  search?: {
    defaultValue: string;
    label: string;
    placeholder: string;
    clearHref: string;
    hiddenFields?: Record<string, string>;
  };
  toolbarHint?: string;
  // removeHref: when set, the chip renders GDS's remove affordance and clearing
  // it navigates there — so a scope like an event filter can be dropped without
  // also discarding every other active filter.
  toolbarFilters?: { label: string; value: string; removeHref?: string }[];
  toolbarTrailing?: { href: string; label: string };
  beforeToolbar?: React.ReactNode;
  dbError?: MongoConnectionDiagnosis | null;
  children: React.ReactNode;
}

export default function AdminListPageShell({
  eyebrow,
  title,
  description,
  status,
  primaryAction,
  stats,
  search,
  toolbarHint,
  toolbarFilters,
  toolbarTrailing,
  beforeToolbar,
  dbError,
  children,
}: AdminListPageShellProps) {
  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
      <WorkspaceHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        status={status}
        primaryAction={primaryAction}
      />

      {!dbError && stats && stats.length > 0 ? (
        <StatsStrip stats={stats.map(({ label, value }) => ({ label, value }))} />
      ) : null}

      {!dbError ? beforeToolbar : null}

      {search ? (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)' }}>
          {toolbarHint ? (
            <div style={{ alignItems: 'center', display: 'flex', gap: 'var(--mantine-spacing-xs)' }}>
              <AdminIcon iconKey="search" size={16} />
              <span style={{ fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-dimmed)' }}>
                {toolbarHint}
              </span>
            </div>
          ) : null}
          <GdsDataToolbar
            searchSlot={
              <div style={{ display: 'grid', flex: 1, gap: 'var(--mantine-spacing-md)' }}>
                <div style={{ alignItems: 'end', display: 'flex', flex: 1, flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)' }}>
                  <form style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-sm)' }}>
                      <label style={{ display: 'grid', flex: '1 1 220px', gap: 6, fontWeight: 600 }}>
                        {search.label}
                        <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                          <AdminIcon iconKey="search" size={16} />
                          <input
                            name="search"
                            defaultValue={search.defaultValue}
                            placeholder={search.placeholder}
                            style={{
                              border: '1px solid var(--mantine-color-gray-4)',
                              borderRadius: 8,
                              flex: 1,
                              minWidth: 0,
                              padding: '10px 12px',
                            }}
                          />
                        </span>
                      </label>
                      {search.hiddenFields
                        ? Object.entries(search.hiddenFields).map(([name, value]) => (
                            <input key={name} type="hidden" name={name} value={value} />
                          ))
                        : null}
                      <button type="submit">
                        Search
                      </button>
                      {search.defaultValue || toolbarFilters?.length ? (
                        <Link href={search.clearHref}>
                          Clear
                        </Link>
                      ) : null}
                    </div>
                  </form>
                </div>
              </div>
            }
            activeFilters={toolbarFilters?.map((chip) => ({
              label: `${chip.label}: ${chip.value}`,
              ...(chip.removeHref
                ? {
                    onRemove: () => {
                      window.location.href = chip.removeHref as string;
                    },
                  }
                : {}),
            }))}
            createAction={
              toolbarTrailing ? (
                <Link href={toolbarTrailing.href}>
                  {toolbarTrailing.label}
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : null}

      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}

      {!dbError ? children : null}
    </div>
  );
}
