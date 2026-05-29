/**
 * Partner Detail Page
 *
 * Display partner details, related event instances, and default resources
 * inherited by child events unless they are overridden.
 */

import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { AccentPanel, AccessSummary } from '@doneisbetter/gds-core/client';
import { StatsStrip } from '@doneisbetter/gds-admin/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import StyleSections from '@/components/admin/StyleSections';
import PartnerUserAccessManager from '@/components/admin/PartnerUserAccessManager';
import AuthorizationMatrix from '@/components/admin/AuthorizationMatrix';
import DeletePartnerButton from '@/components/admin/DeletePartnerButton';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { listPartnerUserAccess } from '@/lib/partners/access';
import {
  getPartnerScopedAccessForPartner,
  isGlobalAdminSession,
  listSessionPartnerAssignments,
} from '@/lib/partners/authorization';
import { cameraInfoToneMap } from '@/lib/gds/presentation';

interface FrameDetailsDoc {
  frameId: string;
  name?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  hashtags?: string[];
}

interface LogoAssignmentDoc {
  logoId: string;
  position?: string;
  maxWidthPercent?: number;
  scenario?: string;
}

interface LogoDoc {
  logoId: string;
  name?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
}

interface PartnerDoc {
  _id: ObjectId;
  partnerId: string;
  name: string;
  description?: string;
  isActive?: boolean;
  contactName?: string;
  contactEmail?: string;
  createdAt: string;
  updatedAt: string;
  defaultBrandColors?: { primary?: string; secondary?: string };
  defaultFrames?: string[];
  defaultLogos?: LogoAssignmentDoc[];
  frameCount?: number;
  defaultFramesWithDetails?: Array<{
    frameId: string;
    isActive: boolean;
    frameDetails: FrameDetailsDoc | null;
  }>;
  defaultLogosWithDetails?: Array<LogoAssignmentDoc & {
    isActive: boolean;
    name?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
  }>;
}

interface EventDoc {
  _id: ObjectId;
  name: string;
  description?: string;
  eventDate?: string;
  location?: string;
  isActive?: boolean;
  frames?: Array<{ frameId: string }>;
}

interface SubmissionDoc {
  _id: ObjectId;
  imageUrl?: string;
  finalImageUrl?: string;
  userName?: string;
  userEmail?: string;
  eventName?: string;
  createdAt: string;
}

interface PartnerAccessAssignmentDoc {
  accessId: string;
  partnerId: string;
  partnerName: string;
  userId?: string | null;
  userEmail: string;
  userName?: string | null;
  appKey: 'events';
  role: 'viewer' | 'manager' | 'admin';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    notFound();
  }

  let partner: PartnerDoc | null = null;
  let events: EventDoc[] = [];
  let submissions: SubmissionDoc[] = [];
  let partnerAccessAssignments: PartnerAccessAssignmentDoc[] = [];
  let participantCount = 0;
  let dbError: string | null = null;
  const session = await getSession();
  const canManagePartner = isGlobalAdminSession(session);
  let canManageEvents = isGlobalAdminSession(session);
  let eventsRoleLabel = isGlobalAdminSession(session) ? 'global admin' : 'no access';

  try {
    const db = await connectToDatabase();

    partner = (await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(id) })) as PartnerDoc | null;
    if (!partner) {
      notFound();
    }

    const workspaceAccess = await getPartnerScopedAccessForPartner(db, session!, partner.partnerId);
    if (!workspaceAccess.allowed) {
      redirect('/admin/partners');
    }

    const assignments = await listSessionPartnerAssignments(db, session!);
    if (!isGlobalAdminSession(session)) {
      const eventAssignment = assignments.find(
        (assignment) => assignment.partnerId === partner!.partnerId && assignment.appKey === 'events' && assignment.isActive
      );
      eventsRoleLabel = eventAssignment?.role ?? 'no access';
      canManageEvents = assignments.some(
        (assignment) =>
          assignment.partnerId === partner!.partnerId &&
          assignment.appKey === 'events' &&
          assignment.isActive &&
          (assignment.role === 'manager' || assignment.role === 'admin')
      );
    }

    events = (await db
      .collection(COLLECTIONS.EVENTS)
      .find({ partnerId: partner.partnerId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()) as unknown as EventDoc[];

    submissions = (await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .find({
        partnerId: partner.partnerId,
        isArchived: false,
        hiddenFromPartner: false,
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()) as unknown as SubmissionDoc[];

    const participantRows = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .aggregate([
        {
          $match: {
            partnerId: partner.partnerId,
            isArchived: false,
            hiddenFromPartner: false,
          },
        },
        {
          $project: {
            participantKey: {
              $ifNull: ['$userInfo.email', { $ifNull: ['$userEmail', '$userId'] }],
            },
          },
        },
        {
          $match: {
            participantKey: { $type: 'string', $ne: '' },
          },
        },
        {
          $group: {
            _id: '$participantKey',
          },
        },
      ])
      .toArray();
    participantCount = participantRows.length;
    partnerAccessAssignments = (await listPartnerUserAccess(db, partner.partnerId)) as unknown as PartnerAccessAssignmentDoc[];

    if (partner.defaultFrames && partner.defaultFrames.length > 0) {
      const frames = (await db
        .collection(COLLECTIONS.FRAMES)
        .find({ frameId: { $in: partner.defaultFrames } })
        .toArray()) as unknown as FrameDetailsDoc[];

      partner.defaultFramesWithDetails = partner.defaultFrames.map((frameId) => {
        const frameDetails = frames.find((frame) => frame.frameId === frameId);
        return {
          frameId,
          isActive: true,
          frameDetails: frameDetails
            ? {
                frameId: frameDetails.frameId,
                name: frameDetails.name,
                thumbnailUrl: frameDetails.thumbnailUrl,
                width: frameDetails.width,
                height: frameDetails.height,
                hashtags: frameDetails.hashtags,
              }
            : null,
        };
      });
    }

    if (partner.defaultLogos && partner.defaultLogos.length > 0) {
      const logoIds = partner.defaultLogos.map((logoAssignment) => logoAssignment.logoId);
      const logos = (await db
        .collection(COLLECTIONS.LOGOS)
        .find({ logoId: { $in: logoIds } })
        .toArray()) as unknown as LogoDoc[];

      partner.defaultLogosWithDetails = partner.defaultLogos.map((logoAssignment) => {
        const logo = logos.find((entry) => entry.logoId === logoAssignment.logoId);
        return {
          ...logoAssignment,
          isActive: true,
          name: logo?.name,
          imageUrl: logo?.imageUrl,
          thumbnailUrl: logo?.thumbnailUrl,
        };
      });
    }
  } catch (error) {
    console.error('Error fetching partner details:', error);
    dbError = error instanceof Error ? error.message : 'Unknown error';
  }

  if (!partner) {
    notFound();
  }
  return (
    <Stack gap="xl">
      <Breadcrumbs>
        <Link href="/admin/partners">Partners</Link>
        <Text>{partner.name}</Text>
      </Breadcrumbs>

      <WorkspaceHeader
        eyebrow="Camera Core"
        title={partner.name}
        description={partner.description}
        status={partner.isActive ? 'Active' : 'Inactive'}
        actions={
          <>
            {canManagePartner ? (
              <Link href={`/admin/partners/${id}/edit`} style={{ textDecoration: 'none' }}>
                <Button>Edit Partner</Button>
              </Link>
            ) : null}
          </>
        }
      />

      {dbError ? (
        <Card bg="red.0" c="red.8">
          <Text fw={700}>Error loading data</Text>
          <Text size="sm">{dbError}</Text>
        </Card>
      ) : null}

      <StatsStrip
        stats={[
          { label: 'Events', value: events.length },
          { label: 'Frames', value: partner.frameCount || 0 },
          { label: 'Photos', value: submissions.length },
          { label: 'Participants', value: participantCount },
          { label: 'User assignments', value: partnerAccessAssignments.length },
        ]}
      />

      <SimpleGrid cols={{ base: 1, xl: 5 }} spacing="lg">
        <AccentPanel tone={cameraInfoToneMap.neutral} variant="subtle" title="Partner Operations">
          <Text size="sm" c="dimmed">
            Use this page as the operating home for this partner’s resources, app surfaces, and gallery context.
          </Text>
        </AccentPanel>

        <Link href={`/admin/partners/${id}/frames`} style={{ textDecoration: 'none' }}>
          <AccentPanel tone={cameraInfoToneMap.blue} variant="subtle" title="Resources">
            <Text size="sm" c="dimmed">
              Manage default frames and logos in partner context instead of starting from the global inventory.
            </Text>
          </AccentPanel>
        </Link>

        <Link
          href={canManageEvents ? `/admin/events/new?partnerId=${partner.partnerId}` : '/admin/events'}
          style={{ textDecoration: 'none' }}
        >
          <AccentPanel tone={cameraInfoToneMap.green} variant="subtle" title="Events App">
            <Text size="sm" c="dimmed">
              {canManageEvents
                ? 'Create and manage the event app instances that use this partner’s brand defaults and resource assignments.'
                : 'Review the event app instances that use this partner’s brand defaults and resource assignments.'}
            </Text>
          </AccentPanel>
        </Link>
        {canManagePartner ? (
          <Link href="/admin/users" style={{ textDecoration: 'none' }}>
            <AccentPanel tone={cameraInfoToneMap.yellow} variant="subtle" title="Users">
              <Text size="sm" c="dimmed">
                View global access-managed users and submission-derived guest identities that show up in this partner’s activity.
              </Text>
            </AccentPanel>
          </Link>
        ) : null}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
        <Stack gap="lg">
          <Card>
            <Title order={3}>Partner Information</Title>
            <Stack gap="md" mt="md">
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <Stack gap={4}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                    Partner ID
                  </Text>
                  <Text ff="monospace" size="sm">
                    {partner.partnerId}
                  </Text>
                </Stack>
              </Group>
              {partner.contactName ? (
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <Stack gap={4}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                      Contact Person
                    </Text>
                    <Text>{partner.contactName}</Text>
                  </Stack>
                </Group>
              ) : null}
              {partner.contactEmail ? (
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <Stack gap={4}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                      Contact Email
                    </Text>
                    <Text component="a" href={`mailto:${partner.contactEmail}`}>
                      {partner.contactEmail}
                    </Text>
                  </Stack>
                </Group>
              ) : null}
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <Stack gap={4}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                    Created
                  </Text>
                  <Text>{new Date(partner.createdAt).toLocaleString()}</Text>
                </Stack>
              </Group>
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <Stack gap={4}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                    Last Updated
                  </Text>
                  <Text>{new Date(partner.updatedAt).toLocaleString()}</Text>
                </Stack>
              </Group>
            </Stack>
          </Card>

          <AccessSummary
            title="Access summary"
            description="Global inventory remains restricted to global admins. Partner-scoped roles are limited to the assigned app surfaces for this partner."
            roles={[
              canManagePartner ? 'Current operator: Global admin' : 'Current operator: Partner-scoped',
              `Events App role: ${eventsRoleLabel}`,
            ]}
            scope={`Active assignments: ${partnerAccessAssignments.filter((assignment) => assignment.isActive).length}`}
          />

          {canManagePartner ? (
            <Card>
              <Title order={3} mb="md">
                Danger Zone
              </Title>
              <DeletePartnerButton partnerId={id} partnerName={partner.name} hasEvents={events.length > 0} eventCount={events.length} />
            </Card>
          ) : null}
        </Stack>

        <Stack gap="lg" style={{ gridColumn: 'span 2' }}>
          {canManagePartner ? (
            <PartnerUserAccessManager
              partnerMongoId={id}
              initialAssignments={partnerAccessAssignments.map((assignment) => ({
                accessId: assignment.accessId,
                partnerId: assignment.partnerId,
                partnerName: assignment.partnerName,
                userId: assignment.userId ?? null,
                userEmail: assignment.userEmail,
                userName: assignment.userName ?? null,
                appKey: assignment.appKey,
                role: assignment.role,
                isActive: assignment.isActive,
                createdAt: assignment.createdAt,
                updatedAt: assignment.updatedAt,
              }))}
            />
          ) : null}

          <AuthorizationMatrix
            compact
            description="This matrix reflects the current live policy for global admin access versus partner-scoped Events roles."
          />

          <StyleSections
            type="partner"
            id={id}
            brandColor={partner.defaultBrandColors?.primary}
            brandBorderColor={partner.defaultBrandColors?.secondary}
            frames={partner.defaultFramesWithDetails || []}
            logos={partner.defaultLogosWithDetails || []}
          />

          <Card p={0}>
            <Group justify="space-between" align="flex-start" p="xl" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
              <div>
                <Title order={3}>Events App</Title>
                <Text size="sm" c="dimmed" mt="xs">
                  Event app instances that inherit this partner’s defaults and can override them when needed.
                </Text>
              </div>
              {canManageEvents ? (
                <Link href={`/admin/events/new?partnerId=${partner.partnerId}`} style={{ textDecoration: 'none' }}>
                  <Button>+ Add Event</Button>
                </Link>
              ) : null}
            </Group>

            {events.length === 0 ? (
              <Stack align="center" gap="sm" p="xl">
                <Text fz={48}>🎯</Text>
                <Text fw={700} fz="lg">
                  No events yet
                </Text>
                <Text c="dimmed" ta="center">
                  Create your first event for this partner
                </Text>
                {canManageEvents ? (
                  <Link href={`/admin/events/new?partnerId=${partner.partnerId}`} style={{ textDecoration: 'none' }}>
                    <Button>Create Event</Button>
                  </Link>
                ) : null}
              </Stack>
            ) : (
              <Stack gap={0}>
                {events.map((event, index) => (
                  <Group
                    key={event._id.toString()}
                    justify="space-between"
                    align="flex-start"
                    p="xl"
                    wrap="wrap"
                    style={index > 0 ? { borderTop: '1px solid var(--mantine-color-gray-2)' } : undefined}
                  >
                    <Stack gap={4} maw={720}>
                      <Link href={`/admin/events/${event._id}`} style={{ textDecoration: 'none' }}>
                        <Text fw={700}>{event.name}</Text>
                      </Link>
                      {event.description ? (
                        <Text size="sm" c="dimmed">
                          {event.description}
                        </Text>
                      ) : null}
                      <Group gap="md" wrap="wrap">
                        {event.eventDate ? (
                          <Text size="xs" c="dimmed">
                            📅 {new Date(event.eventDate).toLocaleDateString()}
                          </Text>
                        ) : null}
                        {event.location ? (
                          <Text size="xs" c="dimmed">
                            📍 {event.location}
                          </Text>
                        ) : null}
                        <Text size="xs" c="dimmed">
                          🖼️ {event.frames?.length || 0} frames
                        </Text>
                      </Group>
                    </Stack>
                    <Group gap="sm" justify="flex-end">
                      <Badge color={event.isActive ? 'green' : 'gray'}>
                        {event.isActive ? '● Active' : '○ Inactive'}
                      </Badge>
                      {canManageEvents ? <Link href={`/admin/events/${event._id}/edit`}>Edit</Link> : null}
                    </Group>
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
      </SimpleGrid>

      <Card p={0}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <Title order={2}>📷 Partner Gallery</Title>
          <Text c="dimmed" mt="xs">
            All photos captured across {partner.name}&apos;s events
          </Text>
        </div>

        {submissions.length === 0 ? (
          <Stack align="center" gap="sm" p="xl">
            <Text fz={48}>📸</Text>
            <Text fw={700} fz="lg">
              No submissions yet
            </Text>
            <Text c="dimmed" ta="center">
              Photos captured at this partner&apos;s events will appear here
            </Text>
            {events.length > 0 ? (
              <Link href={`/capture/${events[0]._id}`} style={{ textDecoration: 'none' }}>
                <Button>📸 Start Capturing</Button>
              </Link>
            ) : null}
          </Stack>
        ) : (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ columnCount: 5, columnGap: '1rem' }}>
              {submissions.map((submission) => (
                <Link
                  key={submission._id.toString()}
                  href={`/share/${submission._id}`}
                  style={{
                    position: 'relative',
                    display: 'block',
                    breakInside: 'avoid',
                    marginBottom: '1rem',
                    borderRadius: 16,
                    overflow: 'hidden',
                    background: 'var(--mantine-color-gray-1)',
                  }}
                >
                  <Image
                    src={submission.imageUrl || submission.finalImageUrl || ''}
                    alt={`Photo by ${submission.userName || submission.userEmail}`}
                    width={1200}
                    height={1600}
                    unoptimized
                    style={{ width: '100%', height: 'auto' }}
                  />
                </Link>
              ))}
            </div>
            {submissions.length >= 50 ? (
              <Text ta="center" size="sm" c="dimmed" mt="lg">
                Showing the 50 most recent submissions
              </Text>
            ) : null}
          </div>
        )}
      </Card>
    </Stack>
  );
}
