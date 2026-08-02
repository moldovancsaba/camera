'use client';

import type { AdminResourceAction, AdminResourceRecord } from '@sovereignsquad/gds-admin/client';
import { GdsIcons } from '@sovereignsquad/gds-core/client';
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@/components/gds/PublicPrimitives';

/**
 * WHAT: A resource card grid with no media/image slot.
 * WHY: AdminResourceManager's card (MediaPreviewCard, from
 *     @sovereignsquad/gds-core) always renders an image block -- a "No
 *     media" placeholder box when the record has no image. Partners,
 *     Events, Slideshows, and Landing Pages have no image to show, so that
 *     placeholder was pure unwanted chrome (reported as a stray empty box
 *     on every card). This mirrors AdminResourceManager's card layout --
 *     title, metadata, status pill, actions -- without the media section,
 *     composed from the same approved gds-core / PublicPrimitives building
 *     blocks used everywhere else in this app's admin surface.
 */
export function ResourceListGrid<T extends AdminResourceRecord>({
  records,
  actions,
  onPreview,
}: {
  records: T[];
  actions: Array<AdminResourceAction<T>>;
  onPreview?: (record: T) => void;
}) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {records.map((record) => (
        <ResourceListCard key={record.id} record={record} actions={actions} onPreview={onPreview} />
      ))}
    </SimpleGrid>
  );
}

function actionIcon(action: { id: string; kind?: string }) {
  if (action.kind === 'danger') return GdsIcons.Delete;
  if (action.id === 'edit') return GdsIcons.Edit;
  return null;
}

function ResourceListCard<T extends AdminResourceRecord>({
  record,
  actions,
  onPreview,
}: {
  record: T;
  actions: Array<AdminResourceAction<T>>;
  onPreview?: (record: T) => void;
}) {
  const primary = actions.find((action) => action.kind === 'primary');
  const secondary = actions.filter((action) => action.kind === 'secondary' || action.kind === 'danger');
  const iconOnly = actions.filter((action) => action.kind === 'icon');

  return (
    <Card withBorder radius="lg" padding="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            {typeof record.title === 'string' ? <Title order={4}>{record.title}</Title> : record.title}
            {record.description ? (
              <Text size="sm" c="dimmed">
                {record.description}
              </Text>
            ) : null}
            {record.metadata?.length ? (
              <Stack gap={2}>
                {record.metadata.map((item, index) => (
                  <Text key={index} size="xs" c="dimmed">
                    <Text component="span" fw={600}>
                      {item.label}:{' '}
                    </Text>
                    {item.value}
                  </Text>
                ))}
              </Stack>
            ) : null}
          </Stack>
          {record.status ? <Badge variant="light">{record.status}</Badge> : null}
        </Group>
        <Group justify="space-between" align="center" gap="sm" wrap="wrap">
          <Group gap="sm" wrap="wrap">
            {secondary.map((action) => {
              const Icon = actionIcon(action);
              return (
                <Button
                  key={action.id}
                  variant="default"
                  color={action.kind === 'danger' ? 'red' : undefined}
                  leftSection={Icon ? <Icon size="1rem" stroke={1.75} /> : undefined}
                  onClick={() => action.onSelect?.(record)}
                  disabled={action.disabled?.(record)}
                >
                  {action.label}
                </Button>
              );
            })}
          </Group>
          <Group gap="sm" wrap="wrap" justify="flex-end" style={{ marginInlineStart: 'auto' }}>
            {iconOnly.map((action) => (
              <Button
                key={action.id}
                variant="subtle"
                size="sm"
                onClick={() => action.onSelect?.(record)}
                disabled={action.disabled?.(record)}
              >
                {action.label}
              </Button>
            ))}
            {primary ? (
              <Button
                variant="filled"
                color={primary.kind === 'danger' ? 'red' : undefined}
                leftSection={(() => {
                  const Icon = actionIcon(primary);
                  return Icon ? <Icon size="1rem" stroke={1.75} /> : undefined;
                })()}
                onClick={() => primary.onSelect?.(record)}
                disabled={primary.disabled?.(record)}
              >
                {primary.label}
              </Button>
            ) : onPreview ? (
              <Button variant="filled" leftSection={<GdsIcons.Preview size="1rem" stroke={1.75} />} onClick={() => onPreview(record)}>
                Preview
              </Button>
            ) : null}
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}
