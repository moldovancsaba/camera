'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { StateBlock } from '@doneisbetter/gds-core/client';

export interface SerializedSubmissionRow {
  id: string;
  imageUrl: string;
  userName: string;
  userEmail: string;
  frameName?: string | null;
  createdAtLabel: string;
  playCount?: number;
  partnerAdminId?: string | null;
  partnerName?: string | null;
  eventAdminId?: string | null;
  eventName?: string | null;
}

export default function SubmissionsInventoryList({ submissions }: { submissions: SerializedSubmissionRow[] }) {
  if (submissions.length === 0) {
    return (
      <Card p="xl">
        <StateBlock
          variant="empty"
          title="No gallery items yet"
          description="Waiting for users to create their first photos!"
        />
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Total: {submissions.length} gallery items
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing="lg">
        {submissions.map((submission) => (
          <Card key={submission.id} p={0} style={{ overflow: 'hidden' }}>
            <Link href={`/share/${submission.id}`}>
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
                    {submission.createdAtLabel}
                  </Text>
                </Group>
                {submission.partnerAdminId && submission.partnerName ? (
                  <Text size="xs" c="dimmed">
                    Partner:{' '}
                    <Text
                      component={Link}
                      href={`/admin/partners/${submission.partnerAdminId}`}
                      span
                      c="blue.7"
                      style={{ textDecoration: 'none' }}
                    >
                      {submission.partnerName}
                    </Text>
                  </Text>
                ) : null}
                {submission.eventAdminId && submission.eventName ? (
                  <Text size="xs" c="dimmed">
                    Event:{' '}
                    <Text
                      component={Link}
                      href={`/admin/events/${submission.eventAdminId}`}
                      span
                      c="blue.7"
                      style={{ textDecoration: 'none' }}
                    >
                      {submission.eventName}
                    </Text>
                  </Text>
                ) : null}
                {!submission.partnerAdminId && !submission.eventAdminId ? (
                  <Text size="xs" c="dimmed">
                    General / unscoped gallery item
                  </Text>
                ) : null}
              </Stack>
              {typeof submission.playCount === 'number' && submission.playCount > 0 ? (
                <Text
                  size="xs"
                  fw={700}
                  ta="center"
                  style={{
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    background: 'var(--mantine-color-grape-light)',
                    color: 'var(--mantine-color-grape-8)',
                  }}
                >
                  Slideshow plays: {submission.playCount}
                </Text>
              ) : null}
              <Group grow gap="sm">
                <Button component={Link} href={`/share/${submission.id}`} fullWidth color="cameraTeal" size="sm">
                  View
                </Button>
                <Button
                  component="a"
                  href={submission.imageUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  fullWidth
                  variant="default"
                  size="sm"
                >
                  Download
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
