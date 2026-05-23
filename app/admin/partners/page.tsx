/**
 * Admin Partners Listing
 * 
 * List all partners with search, filter, pagination, and quick toggle
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
    partners = await db
      .collection(COLLECTIONS.PARTNERS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray() as unknown as PartnerListItem[];

    // Aggregate real-time counts for each partner
    for (const partner of partners) {
      // Count events for this partner
      const eventCount = await db
        .collection(COLLECTIONS.EVENTS)
        .countDocuments({ partnerId: partner.partnerId });
      
      partner.eventCount = eventCount;
      
      // Count frames for this partner (partner-level and event-level frames)
      const frameCount = await db
        .collection(COLLECTIONS.FRAMES)
        .countDocuments({ partnerId: partner.partnerId });
      
      partner.frameCount = frameCount;

      const userAccessCount = await db
        .collection(COLLECTIONS.PARTNER_USER_ACCESS)
        .countDocuments({ partnerId: partner.partnerId, isActive: true });

      partner.userAccessCount = userAccessCount;
    }
  } catch (error) {
    console.error('Error fetching partners:', error);
    dbError = error;
  }

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Partners"
        description="Manage partner organizations, access, and app ownership from one inventory view."
        actions={
          <Link href="/admin/partners/new" style={{ textDecoration: 'none' }}>
            <Button color="cameraTeal" leftSection={<IconPlus size={16} />}>
              Add Partner
            </Button>
          </Link>
        }
      />

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

      <Card>
        <form>
          <Group align="end">
            <TextInput
              name="search"
              defaultValue={search}
              label="Search partners"
              placeholder="Search by name, description, or partner ID"
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1 }}
            />
            <Button type="submit" color="cameraTeal">
              Search
            </Button>
            {search ? (
              <Link href="/admin/partners" style={{ textDecoration: 'none' }}>
                <Button variant="default">Clear</Button>
              </Link>
            ) : null}
          </Group>
        </form>
      </Card>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && partners.length === 0 ? (
        <Card p="xl">
          <Stack align="center" gap="sm">
            <Text fz={48}>🤝</Text>
            <Text fw={700} fz="lg">
              No partners yet
            </Text>
            <Text c="dimmed" ta="center">
              Get started by adding your first partner workspace to Camera Core.
            </Text>
            <Link href="/admin/partners/new" style={{ textDecoration: 'none' }}>
              <Button color="cameraTeal">Add Your First Partner</Button>
            </Link>
          </Stack>
        </Card>
      ) : (
        <DataTable
          columns={[
            { key: 'partner', title: 'Partner Name' },
            { key: 'events', title: 'Events' },
            { key: 'frames', title: 'Frames' },
            { key: 'users', title: 'Users' },
            { key: 'status', title: 'Status' },
            { key: 'created', title: 'Created' },
            { key: 'actions', title: 'Actions', align: 'right' },
          ]}
        >
          {partners.map((partner) => (
            <tr key={partner._id.toString()} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
              <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                <Stack gap={2}>
                  <Link
                    href={`/admin/partners/${partner._id}`}
                    style={{ textDecoration: 'none', color: 'var(--mantine-color-blue-7)', fontWeight: 700 }}
                  >
                    {partner.name}
                  </Link>
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
                  <Link href={`/admin/partners/${partner._id}`} style={{ textDecoration: 'none' }}>
                    <Button variant="subtle" size="compact-sm">
                      View
                    </Button>
                  </Link>
                  <Link href={`/admin/partners/${partner._id}/edit`} style={{ textDecoration: 'none' }}>
                    <Button variant="subtle" size="compact-sm">
                      Edit
                    </Button>
                  </Link>
                </Group>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Stack>
  );
}
