/**
 * Admin Submissions Page
 * 
 * View all photo submissions from all users.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Card, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconPhotoScan, IconSearch, IconUser, IconWorld } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';

interface SubmissionGalleryItem {
  _id: { toString(): string };
  imageUrl: string;
  userName: string;
  userEmail: string;
  partnerId?: string | null;
  partnerName?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  frameName?: string;
  createdAt: string;
  playCount?: number;
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
}

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let submissions: SubmissionGalleryItem[] = [];
  const partnerById = new Map<string, PartnerRef>();
  const eventById = new Map<string, EventRef>();
  let error: unknown = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = { isArchived: false };
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { eventName: { $regex: search, $options: 'i' } },
        { partnerName: { $regex: search, $options: 'i' } },
        { frameName: { $regex: search, $options: 'i' } },
      ];
    }
    // NEW: Exclude archived submissions from main view
    const submissionDocs = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    submissions = submissionDocs as unknown as SubmissionGalleryItem[];

    const partnerIds = Array.from(
      new Set(
        submissions
          .map((submission) => submission.partnerId)
          .filter((partnerId): partnerId is string => typeof partnerId === 'string' && partnerId.trim().length > 0)
      )
    );
    const eventIds = Array.from(
      new Set(
        submissions
          .map((submission) => submission.eventId)
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
  } catch (err) {
    console.error('Error fetching submissions:', err);
    error = err;
  }

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Resource Inventory"
        title="Global Galleries"
        description="Cross-app submission inventory for audit, moderation, and gallery operations."
      />

      {!error && (
        <StatsStrip
          items={[
            { label: 'Gallery Items', value: submissions.length, icon: <IconPhotoScan size={20} /> },
            { label: 'Named Users', value: submissions.filter((submission) => Boolean(submission.userName)).length, icon: <IconUser size={20} /> },
            { label: 'Partner-scoped', value: submissions.filter((submission) => Boolean(submission.partnerId)).length, icon: <IconWorld size={20} /> },
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
              placeholder="Search user, email, partner, event, or frame"
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1 }}
            />
            <Button type="submit" color="cameraTeal">
              Search
            </Button>
            {search ? (
              <Link href="/admin/submissions" style={{ textDecoration: 'none' }}>
                <Button variant="default">Clear</Button>
              </Link>
            ) : null}
          </Group>
        </form>
      </Card>

      {error != null ? <DatabaseConnectionAlert error={error} /> : null}

      {!error && submissions.length === 0 ? (
        <Card p="xl">
          <Stack align="center" gap="sm">
            <Text fz={48}>📷</Text>
            <Text fw={700} fz="lg">
              No gallery items yet
            </Text>
            <Text c="dimmed">Waiting for users to create their first photos!</Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="md">
          <div>
            <Text size="sm" c="dimmed">
              Total: {submissions.length} gallery items
            </Text>
          </div>

          <SimpleGrid cols={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing="lg">
            {submissions.map((submission) => {
              const partner = submission.partnerId ? partnerById.get(submission.partnerId) : undefined;
              const event = submission.eventId ? eventById.get(submission.eventId) : undefined;

              return (
                <Card
                  key={submission._id.toString()}
                  p={0}
                  style={{ overflow: 'hidden' }}
                >
                  <Link href={`/share/${submission._id}`}>
                    <div style={{ position: 'relative', background: 'var(--mantine-color-gray-1)' }}>
                      <Image
                        src={submission.imageUrl}
                        alt={`Photo by ${submission.userName}`}
                        width={1200}
                        height={1600}
                        unoptimized
                        style={{ width: '100%', height: 'auto' }}
                      />
                    </div>
                  </Link>
                  <Stack gap="sm" p="md">
                    <Text fw={700} c="dark.8">
                      {submission.userName}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {submission.userEmail}
                    </Text>
                    <Stack gap={2}>
                      <Group justify="space-between" gap="xs">
                        <Text size="xs" c="dimmed" tt="capitalize">
                          {submission.frameName || 'frameless'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {new Date(submission.createdAt).toLocaleDateString()}
                        </Text>
                      </Group>
                      {partner && (
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
                      {event && (
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
                      {!partner && !event && <Text size="xs" c="dimmed">General / unscoped gallery item</Text>}
                    </Stack>
                    {typeof submission.playCount === 'number' && submission.playCount > 0 && (
                      <Text
                        size="xs"
                        fw={700}
                        ta="center"
                        style={{
                          padding: '0.5rem',
                          borderRadius: '0.5rem',
                          background: 'rgba(147, 51, 234, 0.10)',
                          color: 'rgb(126, 34, 206)',
                        }}
                      >
                        🎬 Slideshow plays: {submission.playCount}
                      </Text>
                    )}
                    <Group grow gap="sm">
                      <Link
                        href={`/share/${submission._id}`}
                        style={{ textDecoration: 'none' }}
                      >
                        <Button fullWidth color="cameraTeal" size="sm">
                          View
                        </Button>
                      </Link>
                      <a
                        href={submission.imageUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'none' }}
                      >
                        <Button fullWidth variant="default" size="sm">
                          Download
                        </Button>
                      </a>
                    </Group>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}
