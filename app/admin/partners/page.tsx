/**
 * Admin Partners Listing
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession, listAccessiblePartnerIds } from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconSearch, IconUsers, IconBuildingStore, IconFrame } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import DataTable from '@/components/gds/DataTable';
import StatusBadge from '@/components/gds/StatusBadge';
import DataToolbar from '@/components/gds/DataToolbar';
import StateBlock from '@/components/gds/StateBlock';
import ResponsiveDataView from '@/components/gds/ResponsiveDataView';

interface PartnerListItem {
  _id: { toString(): string };
  partnerId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  eventCount?: number;
  frameCount?: number;
  userAccessCount?: number;
}

function PartnerMobileCard({ partner }: { partner: PartnerListItem }) {
  const id = partner._id.toString();
  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text
            component={Link}
            href={`/admin/partners/${id}`}
            fw={700}
            c="blue.7"
            lineClamp={2}
            style={{ textDecoration: 'none', minWidth: 0 }}
          >
            {partner.name}
          </Text>
          <StatusBadge tone={partner.isActive ? 'active' : 'inactive'} />
        </Group>
        <Text size="xs" c="dimmed">
          {partner.partnerId}
        </Text>
        <Text size="sm" c="dimmed">
          {partner.eventCount || 0} events · {partner.frameCount || 0} frames · {partner.userAccessCount || 0} users
        </Text>
        <Group gap="sm">
          <Button component={Link} href={`/admin/partners/${id}`} variant="light" size="compact-sm">
            View
          </Button>
          <Button component={Link} href={`/admin/partners/${id}/edit`} variant="subtle" size="compact-sm">
            Edit
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  let partners: PartnerListItem[] = [];
  let dbError: unknown = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const session = await getSession();

  try {
    const db = await connectToDatabase();
    const accessiblePartnerIds = await listAccessiblePartnerIds(db, session!, undefined);
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { partnerId: { $regex: search, $options: 'i' } },
          ],
        }
      : {};
    if (!isGlobalAdminSession(session)) {
      Object.assign(query, { partnerId: { $in: accessiblePartnerIds } });
    }
    partners = (await db
      .collection(COLLECTIONS.PARTNERS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()) as unknown as PartnerListItem[];

    for (const partner of partners) {
      partner.eventCount = await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId: partner.partnerId });
      partner.frameCount = await db.collection(COLLECTIONS.FRAMES).countDocuments({ partnerId: partner.partnerId });
      partner.userAccessCount = await db
        .collection(COLLECTIONS.PARTNER_USER_ACCESS)
        .countDocuments({ partnerId: partner.partnerId, isActive: true });
    }
  } catch (error) {
    console.error('Error fetching partners:', error);
    dbError = error;
  }

  const tableColumns = [
    { key: 'partner', title: 'Partner Name' },
    { key: 'events', title: 'Events' },
    { key: 'frames', title: 'Frames' },
    { key: 'users', title: 'Users' },
    { key: 'status', title: 'Status' },
    { key: 'created', title: 'Created' },
    { key: 'actions', title: 'Actions', align: 'right' as const },
  ];

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Partners"
        description="Manage partner organizations, access, and app ownership from one inventory view."
        actions={
          <Button component={Link} href="/admin/partners/new" color="cameraTeal" leftSection={<IconPlus size={16} />}>
            Add Partner
          </Button>
        }
      />

      {!dbError && (
        <StatsStrip
          items={[
            { label: 'Visible Partners', value: partners.length, icon: <IconBuildingStore size={20} /> },
            {
              label: 'Partner Users',
              value: partners.reduce((sum, partner) => sum + (partner.userAccessCount || 0), 0),
              icon: <IconUsers size={20} />,
            },
            {
              label: 'Partner Frames',
              value: partners.reduce((sum, partner) => sum + (partner.frameCount || 0), 0),
              icon: <IconFrame size={20} />,
            },
          ]}
        />
      )}

      <DataToolbar filters={search ? [{ label: 'Search', value: search }] : undefined}>
        <form style={{ flex: 1, minWidth: 240 }}>
          <Group align="flex-end" wrap="wrap">
            <TextInput
              name="search"
              defaultValue={search}
              label="Search partners"
              placeholder="Name, description, or partner ID"
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1, minWidth: 220 }}
            />
            <Button type="submit" color="cameraTeal">
              Search
            </Button>
            {search ? (
              <Button component={Link} href="/admin/partners" variant="default">
                Clear
              </Button>
            ) : null}
          </Group>
        </form>
      </DataToolbar>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && partners.length === 0 ? (
        <Card>
          <StateBlock
            variant="empty"
            title="No partners yet"
            description="Get started by adding your first partner workspace to Camera Core."
            action={
              <Button component={Link} href="/admin/partners/new" color="cameraTeal">
                Add Your First Partner
              </Button>
            }
          />
        </Card>
      ) : !dbError ? (
        <ResponsiveDataView
          table={
            <DataTable columns={tableColumns}>
              {partners.map((partner) => (
                <tr key={partner._id.toString()} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                  <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                    <Stack gap={2}>
                      <Text
                        component={Link}
                        href={`/admin/partners/${partner._id}`}
                        fw={700}
                        c="blue.7"
                        style={{ textDecoration: 'none' }}
                      >
                        {partner.name}
                      </Text>
                      {partner.description ? (
                        <Text size="sm" c="dimmed" lineClamp={1}>
                          {partner.description}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">
                          {partner.partnerId}
                        </Text>
                      )}
                    </Stack>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>{partner.eventCount || 0}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>{partner.frameCount || 0}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>{partner.userAccessCount || 0}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <StatusBadge tone={partner.isActive ? 'active' : 'inactive'} />
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <Text size="sm" c="dimmed">
                      {new Date(partner.createdAt).toLocaleDateString()}
                    </Text>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                    <Group gap="sm" justify="flex-end">
                      <Button component={Link} href={`/admin/partners/${partner._id}`} variant="subtle" size="compact-sm">
                        View
                      </Button>
                      <Button component={Link} href={`/admin/partners/${partner._id}/edit`} variant="subtle" size="compact-sm">
                        Edit
                      </Button>
                    </Group>
                  </td>
                </tr>
              ))}
            </DataTable>
          }
          mobile={partners.map((partner) => (
            <PartnerMobileCard key={partner._id.toString()} partner={partner} />
          ))}
        />
      ) : null}
    </Stack>
  );
}
