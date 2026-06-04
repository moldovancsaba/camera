/**
 * User Profile Page
 *
 * Displays detailed user profile with all submissions, consents, and event participation.
 * Accessible at /users/[name] - shows full history and photo gallery.
 *
 * Admins with Camera app access (`admin` / `superadmin`) see user management (role / active / merge) on this page.
 *
 * Note: Usernames in URLs are sanitized (spaces/special chars → underscores)
 * We search for matching names by converting both to sanitized format
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Badge, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { getSession } from '@/lib/auth/session';
import { buildUserManagementPropsFromSubmissions } from '@/lib/admin/build-user-management-props';
import UserManagementActions from '@/components/admin/UserManagementActions';

export const dynamic = 'force-dynamic';

/**
 * Sanitize username for comparison
 * Replaces spaces and special characters with underscores
 */
function sanitizeUsername(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLegacyGuestName(value: string): boolean {
  return value.trim().toLowerCase() === 'event guest';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveDisplayName(userName: string | undefined, nameFromUserInfo: string | undefined): string {
  if (typeof nameFromUserInfo === 'string') {
    const normalizedNameFromUserInfo = nameFromUserInfo.trim();
    if (normalizedNameFromUserInfo && !isLikelyEmail(normalizedNameFromUserInfo) && !isLegacyGuestName(normalizedNameFromUserInfo)) {
      return normalizedNameFromUserInfo;
    }
  }
  if (typeof userName === 'string') {
    const normalizedUserName = userName.trim();
    if (normalizedUserName && !isLikelyEmail(normalizedUserName) && !isLegacyGuestName(normalizedUserName)) {
      return normalizedUserName;
    }
  }
  return 'Guest';
}

interface PageProps {
  params: Promise<{
    name: string;
  }>;
}

interface SubmissionRecord {
  _id: { toString(): string };
  userId?: string;
  userName?: string;
  userEmail?: string;
  userInfo?: {
    name?: string;
    email?: string;
    collectedAt?: string;
  };
  eventId?: string;
  eventName?: string;
  partnerName?: string;
  createdAt: string;
  consents?: ConsentRecord[];
  imageUrl?: string;
  frameName?: string;
  playCount?: number;
}

interface ConsentRecord {
  pageId: string;
  pageType: string;
  checkboxText: string;
  acceptedAt: string;
}

interface EventParticipation {
  eventId: string;
  eventName: string;
  partnerName?: string;
  firstSubmissionAt: string;
  submissionCount: number;
}

interface UserProfileView {
  name: string;
  isAnonymous: boolean;
  registeredAt: string;
  events: EventParticipation[];
  consents: ConsentRecord[];
  submissions: Array<{
    _id: { toString(): string };
    imageUrl: string;
    frameName?: string;
    eventName?: string;
    createdAt: string;
    playCount: number;
  }>;
  totalPhotos: number;
}

export default async function UserProfilePage({ params }: PageProps) {
  const { name } = await params;
  const sanitizedUrlName = name;  // Already sanitized in URL (spaces → underscores)
  const session = await getSession();
  const viewerCanManageUsers =
    (session?.appRole === 'admin' || session?.appRole === 'superadmin') &&
    session.appAccess !== false;

  let user: UserProfileView | null = null;
  let error = null;
  let managementProps: Awaited<
    ReturnType<typeof buildUserManagementPropsFromSubmissions>
  > = null;

  try {
    const db = await connectToDatabase();
    
    console.log('=== User Profile Debug ===');
    console.log('Looking for user with sanitized name:', sanitizedUrlName);
    
    // Get all submissions and find matching user by sanitized name comparison
    // Note: Don't filter by isArchived - we want to show all user submissions
    const allSubmissions = await db
      .collection('submissions')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log('Total submissions:', allSubmissions.length);
    console.log('Sample submission:', allSubmissions[0] ? {
      userId: allSubmissions[0].userId,
      userName: allSubmissions[0].userName,
      userEmail: allSubmissions[0].userEmail,
      userInfo: allSubmissions[0].userInfo,
    } : 'none');
    
    // Filter submissions where sanitized username matches the URL parameter
    const submissions = allSubmissions.flatMap((sub) => {
      const nameFromUserInfo = sub.userInfo?.name;
      const nameFromSession = sub.userName;  // From SSO session when user authenticated
      // Check multiple variations of anonymous email for backward compatibility
      const isAnonymous = sub.userId === 'anonymous' || 
                         sub.userEmail === 'anonymous@event.com' ||
                         sub.userEmail === 'anonymous@event';
      
      // Priority: userInfo (from pseudo reg) > session name (from SSO) > Anonymous > Unknown
      const actualName = nameFromUserInfo || 
                        (isAnonymous ? 'Anonymous User' : nameFromSession) || 
                        'Unknown';
      const sanitized = sanitizeUsername(actualName);
      
      console.log(`Checking submission: sanitized="${sanitized}" vs urlName="${sanitizedUrlName}" (userInfo=${nameFromUserInfo}, userName=${nameFromSession}, userEmail=${sub.userEmail}, isAnon=${isAnonymous})`);
      
      return sanitized === sanitizedUrlName ? [sub as unknown as SubmissionRecord] : [];
    });

    console.log('Matched submissions:', submissions.length);
    if (submissions.length === 0) {
      console.log('No submissions found for user:', sanitizedUrlName);
      // Show all unique sanitized names to help debug
      const uniqueNames = new Set(
        allSubmissions.map((s) => {
          const n = s.userInfo?.name || s.userName || 'Unknown';
          return sanitizeUsername(n);
        })
      );
      console.log('Available sanitized names:', Array.from(uniqueNames).slice(0, 10));
      notFound();
    }

    if (viewerCanManageUsers) {
      managementProps = await buildUserManagementPropsFromSubmissions(
        submissions,
        session?.accessToken
      );
    }

    // Build user profile from submissions
    const firstSubmission = submissions[0];
    const hasUserInfo = firstSubmission.userInfo?.email && firstSubmission.userInfo?.name;
    const isAnonymous = !hasUserInfo && 
      (firstSubmission.userId === 'anonymous' || 
       firstSubmission.userEmail === 'anonymous@event.com' ||
       firstSubmission.userEmail === 'anonymous@event');

    // Get unique events this user participated in
    const eventsMap = new Map();
    submissions.forEach((sub) => {
      if (sub.eventId && !eventsMap.has(sub.eventId)) {
        eventsMap.set(sub.eventId, {
          eventId: sub.eventId,
          eventName: sub.eventName || 'Unknown Event',
          partnerName: sub.partnerName,
          firstSubmissionAt: sub.createdAt,
          submissionCount: 0,
        });
      }
      if (sub.eventId) {
        const evt = eventsMap.get(sub.eventId);
        if (evt) evt.submissionCount++;
      }
    });

    // Collect all unique consents
    const consentsMap = new Map();
    submissions.forEach((sub) => {
      if (sub.consents && Array.isArray(sub.consents)) {
        sub.consents.forEach((consent) => {
          if (!consentsMap.has(consent.pageId)) {
            consentsMap.set(consent.pageId, consent);
          }
        });
      }
    });

    user = {
      name: isAnonymous
        ? 'Anonymous User'
        : resolveDisplayName(firstSubmission.userName, hasUserInfo ? firstSubmission.userInfo?.name : undefined),
      isAnonymous: isAnonymous,
      registeredAt: firstSubmission.userInfo?.collectedAt || firstSubmission.createdAt,
      events: Array.from(eventsMap.values()),
      consents: Array.from(consentsMap.values()),
      submissions: submissions.map((sub) => ({
        _id: sub._id,
        imageUrl: sub.imageUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        frameName: sub.frameName,
        eventName: sub.eventName,
        createdAt: sub.createdAt,
        playCount: sub.playCount || 0,
      })),
      totalPhotos: submissions.length,
    };

  } catch (err) {
    console.error('Error fetching user profile:', err);
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  if (!user || error) {
    notFound();
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Navigation */}
          {viewerCanManageUsers ? (
            <Link
              href="/admin/users"
            style={{ textDecoration: 'none' }}
            >
              ← Back to Users List
            </Link>
          ) : (
            <Link
              href="/"
            style={{ textDecoration: 'none' }}
            >
              ← Back to home
            </Link>
          )}

        {viewerCanManageUsers && managementProps ? (
        <Card withBorder radius="lg" p="xl">
          <Stack gap="md">
            <Title order={2}>
              User management
            </Title>
            <Text size="sm" c="dimmed">
              Assign or revoke admin rights, activate or deactivate this account, or merge a
              pseudo user with a real SSO user.
            </Text>
            <UserManagementActions
              user={{
                email: managementProps.email,
                name: managementProps.name,
                type: managementProps.type,
                role: managementProps.role,
                isActive: managementProps.isActive,
                mergedWith: managementProps.mergedWith,
              }}
              currentUserEmail={session?.user.email ?? ''}
            />
          </Stack>
        </Card>
        ) : null}

        {/* User Header */}
      <Card withBorder radius="lg" p="xl">
        <Group justify="space-between" align="flex-start">
          <Stack gap="sm">
            <Group gap="sm">
              <Title order={1}>
                  {user.name}
              </Title>
                {user.isAnonymous ? (
                <Badge variant="light">
                    Anonymous
                </Badge>
                ) : (
                <Badge variant="light">
                    Registered
                </Badge>
                )}
            </Group>
              
            <Stack gap={4}>
              <Text c="dimmed"><Text span fw={600}>Registered:</Text> {new Date(user.registeredAt).toLocaleString()}</Text>
              <Text c="dimmed"><Text span fw={600}>Total Photos:</Text> {user.totalPhotos}</Text>
            </Stack>
          </Stack>
            
          <Card withBorder radius="md" p="lg">
            <Stack align="center" gap={4}>
              <Text fz="3rem" fw={800}>
                {user.totalPhotos}
              </Text>
              <Text size="sm" c="dimmed">
                {user.totalPhotos === 1 ? 'submission' : 'submissions'}
              </Text>
            </Stack>
          </Card>
        </Group>
      </Card>

        {/* Events Participation */}
        {user.events.length > 0 && (
        <Card withBorder radius="lg" p="xl">
          <Stack gap="md">
            <Title order={2}>Event Participation</Title>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              {user.events.map((event, idx: number) => (
                <Card
                  key={`${event.eventId}-${idx}`}
                  withBorder
                  radius="md"
                  p="md"
                >
                  <Link
                    href={
                      viewerCanManageUsers
                        ? `/admin/events/${event.eventId}`
                        : `/capture/${event.eventId}`
                    }
                    style={{ textDecoration: 'none' }}
                  >
                    {event.eventName}
                  </Link>
                  {event.partnerName && (
                    <Text size="sm" c="dimmed" mt={4}>
                      Partner: {event.partnerName}
                    </Text>
                  )}
                  <Text size="sm" c="dimmed" mt={4}>
                    First visit: {new Date(event.firstSubmissionAt).toLocaleDateString()}
                  </Text>
                  <Text size="sm" fw={700} mt={4}>
                    {event.submissionCount} {event.submissionCount === 1 ? 'photo' : 'photos'}
                  </Text>
                </Card>
              ))}
            </SimpleGrid>
          </Stack>
        </Card>
        )}

        {/* Consents Accepted */}
        {user.consents.length > 0 && (
        <Card withBorder radius="lg" p="xl">
          <Stack gap="md">
            <Title order={2}>Consents & Acceptances</Title>
              {user.consents.map((consent, idx: number) => (
              <Card
                  key={`${consent.pageId}-${idx}`}
                withBorder
                radius="md"
                p="md"
                >
                <Stack gap={4}>
                  <Text fw={600}>
                      {consent.checkboxText}
                  </Text>
                  <Text size="sm" c="dimmed">
                      Accepted on {new Date(consent.acceptedAt).toLocaleString()} • {' '}
                    {consent.pageType}
                  </Text>
                </Stack>
              </Card>
              ))}
          </Stack>
        </Card>
        )}

        {/* Photo Gallery */}
      <Card withBorder radius="lg" p="xl">
        <Stack gap="md">
          <Title order={2}>Photo Gallery</Title>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
            {user.submissions.map((submission) => (
              <Card
                key={submission._id.toString()}
                component={Link}
                href={`/share/${submission._id}`}
                p={0}
                withBorder
                radius="md"
              >
                <Stack gap="xs">
                  <div style={{ position: 'relative', aspectRatio: '1' }}>
                    <Image
                      src={submission.imageUrl || '/placeholder-image.svg'}
                      alt={`Photo with ${submission.frameName}`}
                      fill
                      unoptimized
                      style={{ objectFit: 'cover' }}
                    />
                  </div>
                  <Stack gap={2} p="sm">
                    <Text size="sm" fw={600} truncate>{submission.frameName}</Text>
                    <Text size="xs" c="dimmed" truncate>{submission.eventName}</Text>
                    <Text size="xs" c="dimmed">{formatDateTime(submission.createdAt)}</Text>
                    {submission.playCount > 0 ? (
                      <Text size="xs" c="dimmed">{submission.playCount} plays</Text>
                    ) : null}
                  </Stack>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      </Card>
      </Stack>
    </Container>
  );
}
