'use client';

import { Button, Card, Group, Stack, Text, Title } from '@/components/gds/PublicPrimitives';

type ExportFormat = 'csv' | 'json';
type ExportSection = 'all' | 'hourly' | 'preset' | 'garment' | 'event' | 'preset_performance' | 'funnel';

interface ExportSectionConfig {
  key: ExportSection;
  label: string;
  description: string;
  available: boolean;
}

function exportHref(
  format: ExportFormat,
  params: { bucket: string; eventId: string; from: string; to: string; section: ExportSection }
): string {
  const query = new URLSearchParams({ format });
  if (params.bucket) query.set('bucket', params.bucket);
  if (params.eventId) query.set('eventId', params.eventId);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.section !== 'all') query.set('section', params.section);
  return `/api/admin/tryon-analytics/export?${query.toString()}`;
}

export default function TryOnAnalyticsExportControls({
  bucket,
  eventId,
  from,
  to,
  sections,
}: {
  bucket: string;
  eventId: string;
  from: string;
  to: string;
  sections: ExportSectionConfig[];
}) {
  return (
    <Stack gap="sm">
      <div>
        <Title order={3}>Exports</Title>
        <Text c="dimmed" size="sm">
          Download only the report you need with the current filters applied.
        </Text>
      </div>
      <div
        style={{
          display: 'grid',
          gap: 'var(--mantine-spacing-md)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        }}
      >
        {sections.map((section) => (
          <Card key={section.key} padding="md" radius="md" withBorder>
            <Stack gap="sm">
              <div>
                <Text fw={700}>{section.label}</Text>
                <Text c="dimmed" size="sm">
                  {section.description}
                </Text>
              </div>
              <Group grow>
                <Button
                  component="a"
                  href={exportHref('csv', { bucket, eventId, from, to, section: section.key })}
                  disabled={!section.available}
                  variant="light"
                >
                  CSV
                </Button>
                <Button
                  component="a"
                  href={exportHref('json', { bucket, eventId, from, to, section: section.key })}
                  disabled={!section.available}
                  variant="default"
                >
                  JSON
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}
      </div>
    </Stack>
  );
}
