/**
 * Admin Partners Listing
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession, listAccessiblePartnerIds } from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Group, Stack, TextInput } from '@mantine/core';
import { IconPlus, IconSearch, IconUsers, IconBuildingStore, IconFrame } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import DataToolbar from '@/components/gds/DataToolbar';
import PartnersInventoryList, { type SerializedPartnerRow } from '@/components/gds/PartnersInventoryList';
import { formatAdminDate, mongoIdString } from '@/lib/gds/serialize-admin-rows';

export const dynamic = 'force-dynamic';

interface PartnerListItem {
  _id?: unknown;
  partnerId?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  createdAt?: unknown;
  eventCount?: number;
  frameCount?: number;
  userAccessCount?: number;
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  let partnerRows: SerializedPartnerRow[] = [];
  let dbError: unknown = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const accessiblePartnerIds = await listAccessiblePartnerIds(db, session, undefined);
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

    const partners = (await db
      .collection(COLLECTIONS.PARTNERS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()) as unknown as PartnerListItem[];

    partnerRows = [];
    for (const partner of partners) {
      const id = mongoIdString(partner._id);
      const partnerId = partner.partnerId || '';
      if (!id || !partnerId) continue;

      const eventCount = await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId });
      const frameCount = await db.collection(COLLECTIONS.FRAMES).countDocuments({ partnerId });
      const userAccessCount = await db
        .collection(COLLECTIONS.PARTNER_USER_ACCESS)
        .countDocuments({ partnerId, isActive: true });

      partnerRows.push({
        id,
        partnerId,
        name: partner.name || 'Untitled partner',
        description: partner.description ?? null,
        eventCount,
        frameCount,
        userAccessCount,
        createdAtLabel: formatAdminDate(partner.createdAt),
        isActive: Boolean(partner.isActive),
      });
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
          <Button component={Link} href="/admin/partners/new" color="cameraTeal" leftSection={<IconPlus size={16} />}>
            Add Partner
          </Button>
        }
      />

      {!dbError && (
        <StatsStrip
          items={[
            { label: 'Visible Partners', value: partnerRows.length, icon: <IconBuildingStore size={20} /> },
            {
              label: 'Partner Users',
              value: partnerRows.reduce((sum, partner) => sum + partner.userAccessCount, 0),
              icon: <IconUsers size={20} />,
            },
            {
              label: 'Partner Frames',
              value: partnerRows.reduce((sum, partner) => sum + partner.frameCount, 0),
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

      {!dbError ? <PartnersInventoryList partners={partnerRows} /> : null}
    </Stack>
  );
}
