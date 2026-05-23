/**
 * Admin Frames Listing
 * 
 * List all frames with search, filter, and pagination.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Button, Card, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconFrame, IconPlus, IconSearch, IconWorld } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import StatusBadge from '@/components/gds/StatusBadge';

interface FrameListItem {
  _id: { toString(): string };
  frameId?: string;
  imageUrl: string;
  name: string;
  description?: string;
  category?: string;
  isActive: boolean;
  ownershipLevel?: 'global' | 'partner' | 'event';
  partnerId?: string | null;
  partnerName?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  usageCount?: number;
}

interface PartnerRef {
  _id: { toString(): string };
  partnerId: string;
  name: string;
}

interface EventRef {
  _id: { toString(): string };
  eventId: string;
  name: string;
  partnerName?: string;
}

function inferFrameScope(frame: FrameListItem): 'global' | 'partner' | 'event' {
  if (frame.ownershipLevel) return frame.ownershipLevel;
  if (frame.eventId) return 'event';
  if (frame.partnerId) return 'partner';
  return 'global';
}

export default async function FramesPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let frames: FrameListItem[] = [];
  const partnerById = new Map<string, PartnerRef>();
  const eventById = new Map<string, EventRef>();
  let dbError: unknown = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } },
          ],
        }
      : {};
    const frameDocs = await db
      .collection(COLLECTIONS.FRAMES)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    frames = frameDocs as unknown as FrameListItem[];

    const partnerIds = Array.from(
      new Set(
        frames
          .map((frame) => frame.partnerId)
          .filter((partnerId): partnerId is string => typeof partnerId === 'string' && partnerId.trim().length > 0)
      )
    );
    const eventIds = Array.from(
      new Set(
        frames
          .map((frame) => frame.eventId)
          .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.trim().length > 0)
      )
    );

    if (partnerIds.length > 0) {
      const partners = (await db
        .collection(COLLECTIONS.PARTNERS)
        .find({ partnerId: { $in: partnerIds } })
        .toArray()) as unknown as PartnerRef[];
      for (const partner of partners) {
        partnerById.set(partner.partnerId, partner);
      }
    }

    if (eventIds.length > 0) {
      const events = (await db
        .collection(COLLECTIONS.EVENTS)
        .find({ eventId: { $in: eventIds } })
        .toArray()) as unknown as EventRef[];
      for (const event of events) {
        eventById.set(event.eventId, event);
      }
    }
  } catch (error) {
    console.error('Error fetching frames:', error);
    dbError = error;
  }

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Resource Inventory"
        title="Global Frames"
        description="Shared frame inventory across partners and app experiences."
        actions={
          <Link href="/admin/frames/new" style={{ textDecoration: 'none' }}>
            <Button color="cameraTeal" leftSection={<IconPlus size={16} />}>
              Add Shared Frame
            </Button>
          </Link>
        }
      />

      {!dbError && (
        <StatsStrip
          items={[
            { label: 'Visible Frames', value: frames.length, icon: <IconFrame size={20} /> },
            {
              label: 'Active Frames',
              value: frames.filter((frame) => frame.isActive).length,
              icon: <IconWorld size={20} />,
            },
            {
              label: 'Assignments',
              value: frames.reduce((sum, frame) => sum + (frame.usageCount || 0), 0),
              icon: <IconFrame size={20} />,
            },
          ]}
        />
      )}

      <Card>
        <form>
          <Group align="end">
            <TextInput
              name="search"
              defaultValue={search}
              label="Search"
              placeholder="Search frame name, description, or category"
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1 }}
            />
            <Button type="submit" color="cameraTeal">
              Search
            </Button>
            {search ? (
              <Link href="/admin/frames" style={{ textDecoration: 'none' }}>
                <Button variant="default">Clear</Button>
              </Link>
            ) : null}
          </Group>
        </form>
      </Card>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && frames.length === 0 ? (
        <Card p="xl">
          <Stack align="center" gap="sm">
            <Text fz={48}>🖼️</Text>
            <Text fw={700} fz="lg">
              No frames yet
            </Text>
            <Text c="dimmed" ta="center">
              Add your first shared frame to start assigning it across partners and apps.
            </Text>
            <Link href="/admin/frames/new" style={{ textDecoration: 'none' }}>
              <Button color="cameraTeal">Add Your First Frame</Button>
            </Link>
          </Stack>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing="lg">
          {frames.map((frame) => {
            const scope = inferFrameScope(frame);
            const partner = frame.partnerId ? partnerById.get(frame.partnerId) : undefined;
            const event = frame.eventId ? eventById.get(frame.eventId) : undefined;

            return (
              <Card
                key={frame._id.toString()}
                p={0}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ position: 'relative', background: 'var(--mantine-color-gray-1)', aspectRatio: '1', maxHeight: '300px' }}>
                  <Image
                    src={frame.imageUrl}
                    alt={frame.name}
                    fill
                    style={{ objectFit: 'contain', padding: 16 }}
                    unoptimized
                  />
                </div>
                <Stack gap="sm" p="md">
                  <Group gap="xs">
                    <StatusBadge
                      tone={scope === 'event' ? 'active' : scope === 'partner' ? 'info' : 'inactive'}
                      label={scope === 'global' ? 'Global' : scope === 'partner' ? 'Partner' : 'Event'}
                    />
                    <StatusBadge tone={frame.isActive ? 'active' : 'inactive'} />
                  </Group>
                  <Text fw={700} c="dark.8">
                    {frame.name}
                  </Text>
                  {frame.description && (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {frame.description}
                    </Text>
                  )}
                  <Stack gap={2}>
                    <Group justify="space-between" gap="xs">
                      <Text size="xs" c="dimmed" tt="capitalize">
                        {frame.category || 'general'}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Used {frame.usageCount || 0} time{frame.usageCount === 1 ? '' : 's'}
                      </Text>
                    </Group>
                    {scope === 'partner' && partner && (
                      <Text size="xs" c="dimmed">
                        Partner:{' '}
                        <Link
                          href={`/admin/partners/${partner._id.toString()}`}
                          style={{ color: 'var(--mantine-color-blue-7)' }}
                        >
                          {partner.name}
                        </Link>
                      </Text>
                    )}
                    {scope === 'event' && event && (
                      <Text size="xs" c="dimmed">
                        Event:{' '}
                        <Link
                          href={`/admin/events/${event._id.toString()}`}
                          style={{ color: 'var(--mantine-color-blue-7)' }}
                        >
                          {event.name}
                        </Link>
                      </Text>
                    )}
                    {scope === 'event' && event?.partnerName && (
                      <Text size="xs" c="dimmed">Partner: {event.partnerName}</Text>
                    )}
                  </Stack>
                  <Link
                    href={`/admin/frames/${frame._id}/edit`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Button fullWidth color="cameraTeal" variant="filled">
                      Edit
                    </Button>
                  </Link>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
}
