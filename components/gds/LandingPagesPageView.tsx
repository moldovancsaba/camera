'use client';

import Link from 'next/link';
import { Button, Card, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import DataTable from '@/components/gds/DataTable';
import StatusBadge from '@/components/gds/StatusBadge';
import StateBlock from '@/components/gds/StateBlock';
import InfoCard from '@/components/gds/InfoCard';

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
          <InfoCard
            tone="cyan"
            title="Shared resource"
            description="Landing pages are now visible as first-class Camera Core assets instead of living only inside event detail pages."
          />
          <InfoCard
            tone="blue"
            title="Current inventory"
            description={`${landingPages.length} landing page${landingPages.length === 1 ? '' : 's'} matched the current filters.`}
          />
          <InfoCard
            tone="green"
            title="Editing model"
            description="Create and edit pages from their parent event today. Use this inventory to find ownership, public URLs, and embedded slideshow/layout relationships globally."
          />
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
          columns={[
            { key: 'landingPage', title: 'Landing Page' },
            { key: 'ownership', title: 'Partner / Event' },
            { key: 'target', title: 'Embedded Target' },
            { key: 'status', title: 'Status' },
            { key: 'actions', title: 'Actions', align: 'right' },
          ]}
        >
          {landingPages.map((page) => (
            <tr key={page.id} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
              <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                <Text fw={700}>{page.title?.trim() || page.slug}</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  /landing/{page.slug}
                </Text>
                <Text size="xs" c="dimmed" mt="sm">
                  Updated {page.updatedAtLabel}
                </Text>
              </td>
              <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                <Text size="sm" fw={600}>
                  {page.partnerName || 'Unknown partner'}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {page.eventName}
                </Text>
              </td>
              <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                <Text size="sm">{page.targetType === 'layout' ? 'Layout' : 'Slideshow'}</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {page.targetName}
                </Text>
              </td>
              <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                <StatusBadge tone={page.isActive ? 'active' : 'inactive'} />
              </td>
              <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top', textAlign: 'right' }}>
                <Group gap="sm" justify="flex-end">
                  <Text component={Link} href={`/admin/events/${page.eventMongoId}`} size="sm" c="blue.7">
                    Open Event
                  </Text>
                  <Text
                    component={Link}
                    href={`/admin/events/${page.eventMongoId}/landing-pages/${page.id}`}
                    size="sm"
                    c="blue.7"
                  >
                    Edit
                  </Text>
                  <Text component={Link} href={`/landing/${page.slug}`} target="_blank" size="sm" c="blue.7">
                    Open
                  </Text>
                </Group>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : null}
    </Stack>
  );
}
