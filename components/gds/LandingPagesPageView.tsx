'use client';

import Link from 'next/link';
import { Button, Card, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { AccentPanel, StateBlock, StatusBadge } from '@doneisbetter/gds-core/client';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import DataTable from '@/components/gds/DataTable';
import { cameraInfoToneMap, getStatusBadgeProps } from '@/lib/gds/presentation';

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
  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Resource Inventory"
        title="Landing Pages"
        description="Shared experience surfaces across Camera Core. Each landing page belongs to an event today, but this inventory makes ownership, embedded targets, and public URLs manageable from one place."
      />

      {!dbError ? (
        <SimpleGrid cols={{ base: 1, xl: 3 }}>
          <AccentPanel tone={cameraInfoToneMap.cyan} variant="subtle" title="Shared resource">
            <Text size="sm" c="dimmed">
              Landing pages are now visible as first-class Camera Core assets instead of living only inside event detail pages.
            </Text>
          </AccentPanel>
          <AccentPanel tone={cameraInfoToneMap.blue} variant="subtle" title="Current inventory">
            <Text size="sm" c="dimmed">
              {landingPages.length} landing page{landingPages.length === 1 ? '' : 's'} matched the current filters.
            </Text>
          </AccentPanel>
          <AccentPanel tone={cameraInfoToneMap.green} variant="subtle" title="Editing model">
            <Text size="sm" c="dimmed">
              Create and edit pages from their parent event today. Use this inventory to find ownership, public URLs, and embedded slideshow/layout relationships globally.
            </Text>
          </AccentPanel>
        </SimpleGrid>
      ) : null}

      <Card>
        <form>
          <Group align="end">
            <TextInput
              name="search"
              defaultValue={search}
              placeholder="Search slug, title, event, or embedded target"
              label="Search"
              style={{ flex: 1 }}
            />
            <TextInput
              name="partner"
              defaultValue={partnerFilter}
              placeholder="Exact partner name filter"
              label="Partner"
            />
            <Button type="submit">Search</Button>
            {search || partnerFilter ? (
              <Button component={Link} href="/admin/landing-pages" variant="default">
                Clear
              </Button>
            ) : null}
          </Group>
        </form>
      </Card>

      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}

      {!dbError && landingPages.length === 0 ? (
        <Card>
          <StateBlock
            variant="empty"
            title="No landing pages found"
            description="Create a landing page from an event workspace, then manage and audit it here."
          />
        </Card>
      ) : null}

      {!dbError && landingPages.length > 0 ? (
        <DataTable
          data={landingPages}
          columns={[
            {
              key: 'landingPage',
              label: 'Landing Page',
              render: (page) => (
                <Stack gap={2}>
                  <Text fw={700}>{page.title?.trim() || page.slug}</Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    /landing/{page.slug}
                  </Text>
                  <Text size="xs" c="dimmed" mt="sm">
                    Updated {page.updatedAtLabel}
                  </Text>
                </Stack>
              ),
            },
            {
              key: 'ownership',
              label: 'Partner / Event',
              render: (page) => (
                <Stack gap={2}>
                  <Text size="sm" fw={600}>
                    {page.partnerName || 'Unknown partner'}
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {page.eventName}
                  </Text>
                </Stack>
              ),
            },
            {
              key: 'target',
              label: 'Embedded Target',
              render: (page) => (
                <Stack gap={2}>
                  <Text size="sm">{page.targetType === 'layout' ? 'Layout' : 'Slideshow'}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {page.targetName}
                  </Text>
                </Stack>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              render: (page) => <StatusBadge {...getStatusBadgeProps(page.isActive ? 'active' : 'inactive')} />,
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (page) => (
                <Group gap="sm" justify="flex-end">
                  <Text component={Link} href={`/admin/events/${page.eventMongoId}`} size="sm">
                    Open Event
                  </Text>
                  <Text
                    component={Link}
                    href={`/admin/events/${page.eventMongoId}/landing-pages/${page.id}`}
                    size="sm"
                  >
                    Edit
                  </Text>
                  <Text component={Link} href={`/landing/${page.slug}`} target="_blank" size="sm">
                    Open
                  </Text>
                </Group>
              ),
            },
          ]}
          getRowKey={(page) => page.id}
        />
      ) : null}
    </Stack>
  );
}
