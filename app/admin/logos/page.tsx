/**
 * Logos Admin Page
 *
 * Shared logo inventory with assignment context.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import Link from 'next/link';
import Image from 'next/image';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { redirect } from 'next/navigation';
import { Button, Card, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconPhoto, IconPlus, IconSearch, IconUsers } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import StatusBadge from '@/components/gds/StatusBadge';

interface Logo {
  _id: { toString(): string };
  logoId: string;
  name: string;
  description?: string;
  imageUrl: string;
  thumbnailUrl: string;
  isActive: boolean;
  usageCount?: number;
  createdAt: string;
}

interface PartnerLogoUsage {
  _id: { toString(): string };
  partnerId: string;
  name: string;
  defaultLogos?: Array<{ logoId: string }>;
}

interface EventLogoUsage {
  _id: { toString(): string };
  eventId: string;
  name: string;
  partnerName?: string;
  logos?: Array<{ logoId: string }>;
}

export default async function LogosPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let logos: Logo[] = [];
  const partnerUsageByLogoId = new Map<string, PartnerLogoUsage[]>();
  const eventUsageByLogoId = new Map<string, EventLogoUsage[]>();
  let error: unknown = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { logoId: { $regex: search, $options: 'i' } },
          ],
        }
      : {};
    logos = (await db
      .collection(COLLECTIONS.LOGOS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()) as unknown as Logo[];

    const partners = (await db
      .collection(COLLECTIONS.PARTNERS)
      .find({ defaultLogos: { $exists: true, $ne: [] } })
      .toArray()) as unknown as PartnerLogoUsage[];
    for (const partner of partners) {
      for (const logo of partner.defaultLogos || []) {
        const bucket = partnerUsageByLogoId.get(logo.logoId) || [];
        bucket.push(partner);
        partnerUsageByLogoId.set(logo.logoId, bucket);
      }
    }

    const events = (await db
      .collection(COLLECTIONS.EVENTS)
      .find({ logos: { $exists: true, $ne: [] } })
      .toArray()) as unknown as EventLogoUsage[];
    for (const event of events) {
      for (const logo of event.logos || []) {
        const bucket = eventUsageByLogoId.get(logo.logoId) || [];
        bucket.push(event);
        eventUsageByLogoId.set(logo.logoId, bucket);
      }
    }
  } catch (err) {
    console.error('Error fetching logos:', err);
    error = err;
  }

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Resource Inventory"
        title="Global Logos"
        description="Shared logo inventory across partners, event scenarios, and app experiences"
        actions={
          <Link href="/admin/logos/new" style={{ textDecoration: 'none' }}>
            <Button color="cameraTeal" leftSection={<IconPlus size={16} />}>
              Upload Shared Logo
            </Button>
          </Link>
        }
      />

      {!error && (
        <StatsStrip
          items={[
            { label: 'Visible Logos', value: logos.length, icon: <IconPhoto size={20} /> },
            { label: 'Partner Defaults', value: Array.from(partnerUsageByLogoId.values()).reduce((sum, bucket) => sum + bucket.length, 0), icon: <IconUsers size={20} /> },
            { label: 'Event Assignments', value: Array.from(eventUsageByLogoId.values()).reduce((sum, bucket) => sum + bucket.length, 0), icon: <IconPhoto size={20} /> },
          ]}
        />
      )}

      <Card>
        <form>
          <Group align="end">
            <TextInput
              type="text"
              name="search"
              defaultValue={search}
              label="Search"
              placeholder="Search logo name, description, or logo ID"
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1 }}
            />
            <Button type="submit" color="cameraTeal">
              Search
            </Button>
            {search ? (
              <Link href="/admin/logos" style={{ textDecoration: 'none' }}>
                <Button variant="default">Clear</Button>
              </Link>
            ) : null}
          </Group>
        </form>
      </Card>

      {error != null ? <DatabaseConnectionAlert error={error} /> : null}

      {!error && logos.length === 0 ? (
        <Card p="xl">
          <Stack align="center" gap="sm">
            <Text fz={48}>🎨</Text>
            <Text fw={700} fz="lg">
              No logos yet
            </Text>
            <Text c="dimmed" ta="center">
              Upload your first shared logo to start assigning it across partners and apps
            </Text>
            <Link href="/admin/logos/new" style={{ textDecoration: 'none' }}>
              <Button color="cameraTeal">Upload Shared Logo</Button>
            </Link>
          </Stack>
        </Card>
      ) : !error ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
          {logos.map((logo) => {
            const partnerAssignments = partnerUsageByLogoId.get(logo.logoId) || [];
            const eventAssignments = eventUsageByLogoId.get(logo.logoId) || [];
            const primaryPartner = partnerAssignments[0];
            const primaryEvent = eventAssignments[0];

            return (
              <Card
                key={logo.logoId}
                p={0}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--mantine-color-gray-1)' }}>
                  <Image
                    src={logo.imageUrl}
                    alt={logo.name}
                    fill
                    style={{ objectFit: 'contain', padding: 16 }}
                    unoptimized
                  />
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <StatusBadge tone={logo.isActive ? 'active' : 'inactive'} />
                  </div>
                </div>
                <Stack gap="sm" p="md">
                  <Text fw={700} c="dark.8" truncate="end">
                    {logo.name}
                  </Text>
                  {logo.description && (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {logo.description}
                    </Text>
                  )}
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">Partner defaults: {partnerAssignments.length}</Text>
                    <Text size="xs" c="dimmed">Event assignments: {eventAssignments.length}</Text>
                    <Text size="xs" c="dimmed">Usage counter: {logo.usageCount || 0}</Text>
                    {primaryPartner && (
                      <Text size="xs" c="dimmed">
                        Partner:{' '}
                        <Link
                          href={`/admin/partners/${primaryPartner._id.toString()}`}
                          style={{ color: 'var(--mantine-color-blue-7)' }}
                        >
                          {primaryPartner.name}
                        </Link>
                      </Text>
                    )}
                    {!primaryPartner && primaryEvent && (
                      <Text size="xs" c="dimmed">
                        Event:{' '}
                        <Link
                          href={`/admin/events/${primaryEvent._id.toString()}`}
                          style={{ color: 'var(--mantine-color-blue-7)' }}
                        >
                          {primaryEvent.name}
                        </Link>
                      </Text>
                    )}
                    {!primaryPartner && !primaryEvent && <Text size="xs" c="dimmed">Unassigned shared logo</Text>}
                  </Stack>
                  <Link
                    href={`/admin/logos/${logo._id.toString()}/edit`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Button fullWidth color="cameraTeal">
                      Edit
                    </Button>
                  </Link>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      ) : null}
    </Stack>
  );
}
