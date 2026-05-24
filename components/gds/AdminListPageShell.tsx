'use client';

import Link from 'next/link';
import { Button, Group, Stack, TextInput } from '@mantine/core';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip, { type StatItem } from '@/components/gds/StatsStrip';
import DataToolbar from '@/components/gds/DataToolbar';
import { AdminIcon } from '@/lib/gds/admin-icon-key';
import type { AdminIconKey } from '@/lib/gds/admin-icon-key';

export interface AdminListPageShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: string;
  primaryAction?: { href: string; label: string; iconKey?: AdminIconKey };
  stats?: StatItem[];
  search?: {
    defaultValue: string;
    label: string;
    placeholder: string;
    clearHref: string;
    hiddenFields?: Record<string, string>;
  };
  toolbarHint?: string;
  toolbarFilters?: { label: string; value: string }[];
  toolbarTrailing?: { href: string; label: string };
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
  dbError,
  children,
}: AdminListPageShellProps) {
  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        status={status}
        primaryAction={primaryAction}
      />

      {!dbError && stats && stats.length > 0 ? <StatsStrip items={stats} /> : null}

      {search ? (
        <DataToolbar
          hint={toolbarHint}
          filters={toolbarFilters}
          trailing={
            toolbarTrailing ? (
              <Button component={Link} href={toolbarTrailing.href} variant="light" color="cameraTeal">
                {toolbarTrailing.label}
              </Button>
            ) : undefined
          }
        >
          <form style={{ flex: 1, minWidth: 240 }}>
            <Group align="flex-end" wrap="wrap">
              <TextInput
                name="search"
                defaultValue={search.defaultValue}
                label={search.label}
                placeholder={search.placeholder}
                leftSection={<AdminIcon iconKey="search" size={16} />}
                style={{ flex: 1, minWidth: 220 }}
              />
              {search.hiddenFields
                ? Object.entries(search.hiddenFields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))
                : null}
              <Button type="submit" color="cameraTeal">
                Search
              </Button>
              {search.defaultValue || toolbarFilters?.length ? (
                <Button component={Link} href={search.clearHref} variant="default">
                  Clear
                </Button>
              ) : null}
            </Group>
          </form>
        </DataToolbar>
      ) : null}

      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}

      {!dbError ? children : null}
    </Stack>
  );
}
