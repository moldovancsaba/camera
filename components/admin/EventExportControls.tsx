'use client';

/**
 * Event export controls
 *
 * Download controls on the event detail page for:
 * - all email addresses collected against the event (deduplicated CSV)
 * - all images related to the event (URL CSV always; ZIP of files when small enough)
 *
 * Downloads are plain GET links; the API routes set Content-Disposition so the
 * browser saves the file. The ZIP endpoint is capped server-side, so the hint
 * points larger events to the CSV.
 */

import { Button, Card, Group, Stack, Text, Title } from '@/components/gds/PublicPrimitives';

export default function EventExportControls({ eventId }: { eventId: string }) {
  const base = `/api/admin/events/${eventId}/export`;

  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="md">
        <div>
          <Title order={3}>Exports</Title>
          <Text c="dimmed" size="sm">
            Download the email addresses and images collected for this event.
          </Text>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 'var(--mantine-spacing-md)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          }}
        >
          <Card padding="md" radius="md" withBorder>
            <Stack gap="sm">
              <div>
                <Text fw={700}>Email addresses</Text>
                <Text c="dimmed" size="sm">
                  Deduplicated list of every address collected from SSO sign-ins and the guest form.
                </Text>
              </div>
              <Button component="a" href={`${base}/emails`} variant="light">
                Download CSV
              </Button>
            </Stack>
          </Card>

          <Card padding="md" radius="md" withBorder>
            <Stack gap="sm">
              <div>
                <Text fw={700}>Images</Text>
                <Text c="dimmed" size="sm">
                  Originals, finals, and try-on results. The CSV lists every image URL; the ZIP
                  bundles the actual files (smaller events only).
                </Text>
              </div>
              <Group grow>
                <Button component="a" href={`${base}/images?format=csv`} variant="light">
                  URL CSV
                </Button>
                <Button component="a" href={`${base}/images?format=zip`} variant="default">
                  ZIP
                </Button>
              </Group>
            </Stack>
          </Card>
        </div>
      </Stack>
    </Card>
  );
}
