/**
 * User Profile Page
 *
 * Displays user's photo submission history in a gallery view.
 */

import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { connectToDatabase } from '@/lib/db/mongodb';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { ObjectId } from 'mongodb';
import PublicSurfaceShell from '@/components/gds/PublicSurfaceShell';
import EmptyState from '@/components/gds/EmptyState';
import { Alert, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';

interface ProfileSubmission {
  _id: ObjectId;
  imageUrl: string;
  frameName?: string;
  createdAt: string;
}

// This page uses cookies and database, so it must be dynamic
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  // Check authentication
  const session = await getSession();

  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  // Fetch user's submissions
  let submissions: ProfileSubmission[] = [];
  let error = null;

  try {
    const db = await connectToDatabase();
    const rawSubmissions = await db
      .collection('submissions')
      .find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    submissions = rawSubmissions.flatMap((submission) =>
      typeof submission.imageUrl === 'string' && typeof submission.createdAt === 'string'
        ? [
            {
              _id: submission._id,
              imageUrl: submission.imageUrl,
              frameName: typeof submission.frameName === 'string' ? submission.frameName : undefined,
              createdAt: submission.createdAt,
            },
          ]
        : []
    );
  } catch (err) {
    console.error('Error fetching submissions:', err);
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  return (
    <PublicSurfaceShell size="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>My Gallery</Title>
            <Text c="dimmed" mt="xs">
              {session.user.name || session.user.email}
            </Text>
          </div>
          <Button component={Link} href="/" variant="subtle" color="gray">
            ← Back
          </Button>
        </Group>

        <Group>
          <Button component={Link} href="/capture" color="cameraTeal">
            📸 Take New Photo
          </Button>
        </Group>

        {error ? (
          <Alert color="red" title="Error loading gallery" role="alert">
            <Text size="sm">{error}</Text>
          </Alert>
        ) : null}

        {!error && submissions.length === 0 ? (
          <EmptyState
            icon={<Text fz={48}>📷</Text>}
            title="No photos yet"
            description="Start creating amazing photos with frames!"
            action={
              <Button component={Link} href="/capture" color="cameraTeal">
                Take Your First Photo
              </Button>
            }
          />
        ) : null}

        {!error && submissions.length > 0 ? (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
                {submissions.length} {submissions.length === 1 ? 'photo' : 'photos'}
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
              {submissions.map((submission) => (
                <Card
                  key={submission._id.toString()}
                  p="sm"
                  styles={{ root: { overflow: 'hidden' } }}
                >
                  <Link href={`/share/${submission._id}`}>
                    <div style={{ borderRadius: 8, overflow: 'hidden', background: 'var(--mantine-color-gray-1)' }}>
                      <Image
                        src={submission.imageUrl}
                        alt={`Photo with ${submission.frameName}`}
                        width={800}
                        height={800}
                        unoptimized
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                      />
                    </div>
                  </Link>
                  <Stack gap={4} mt="sm">
                    <Text fw={600}>{submission.frameName}</Text>
                    <Text size="xs" c="dimmed">
                      {new Date(submission.createdAt).toLocaleDateString()}
                    </Text>
                    <Group gap="sm" mt="xs">
                      <Button component="a" href={submission.imageUrl} download target="_blank" rel="noopener noreferrer" color="cameraTeal" size="xs">
                        💾 Download
                      </Button>
                      <Button component={Link} href={`/share/${submission._id}`} variant="default" size="xs">
                        🔗 Share
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </Stack>
        ) : null}
      </Stack>
    </PublicSurfaceShell>
  );
}
