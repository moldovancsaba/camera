'use client';

import Link from 'next/link';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { StateBlock } from '@doneisbetter/gds-core/client';
import { StatusBadge } from '@doneisbetter/gds-core/client';
import ResponsiveDataView from '@/components/gds/ResponsiveDataView';
import { getStatusBadgeProps } from '@/lib/gds/presentation';

export interface SerializedPartnerRow {
  id: string;
  partnerId: string;
  name: string;
  description?: string | null;
  eventCount: number;
  frameCount: number;
  userAccessCount: number;
  createdAtLabel: string;
  isActive: boolean;
}

function PartnerMobileCard({ partner }: { partner: SerializedPartnerRow }) {
  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text
            component={Link}
            href={`/admin/partners/${partner.id}`}
            fw={700}
            lineClamp={2}
            style={{ textDecoration: 'none', minWidth: 0 }}
          >
            {partner.name}
          </Text>
          <StatusBadge {...getStatusBadgeProps(partner.isActive ? 'active' : 'inactive')} />
        </Group>
        <Text size="xs" c="dimmed">
          {partner.partnerId}
        </Text>
        <Text size="sm" c="dimmed">
          {partner.eventCount} events · {partner.frameCount} frames · {partner.userAccessCount} users
        </Text>
        <Group gap="sm">
          <Button component={Link} href={`/admin/partners/${partner.id}`} variant="light" size="compact-sm">
            View
          </Button>
          <Button component={Link} href={`/admin/partners/${partner.id}/edit`} variant="subtle" size="compact-sm">
            Edit
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export default function PartnersInventoryList({ partners }: { partners: SerializedPartnerRow[] }) {
  if (partners.length === 0) {
    return (
      <Card>
        <StateBlock
          variant="empty"
          title="No partners yet"
          description="Get started by adding your first partner workspace to Camera Core."
          action={
            <Button component={Link} href="/admin/partners/new">
              Add Your First Partner
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <ResponsiveDataView
      data={partners}
      columns={[
        {
          key: 'partner',
          label: 'Partner Name',
          render: (partner) => (
            <Stack gap={2}>
              <Text
                component={Link}
                href={`/admin/partners/${partner.id}`}
                fw={700}
                style={{ textDecoration: 'none' }}
              >
                {partner.name}
              </Text>
              {partner.description ? (
                <Text size="sm" c="dimmed" lineClamp={1}>
                  {partner.description}
                </Text>
              ) : (
                <Text size="xs" c="dimmed">
                  {partner.partnerId}
                </Text>
              )}
            </Stack>
          ),
        },
        { key: 'events', label: 'Events', render: (partner) => partner.eventCount },
        { key: 'frames', label: 'Frames', render: (partner) => partner.frameCount },
        { key: 'users', label: 'Users', render: (partner) => partner.userAccessCount },
        {
          key: 'status',
          label: 'Status',
          render: (partner) => <StatusBadge {...getStatusBadgeProps(partner.isActive ? 'active' : 'inactive')} />,
        },
        {
          key: 'created',
          label: 'Created',
          render: (partner) => (
            <Text size="sm" c="dimmed">
              {partner.createdAtLabel}
            </Text>
          ),
        },
        {
          key: 'actions',
          label: 'Actions',
          render: (partner) => (
            <Group gap="sm" justify="flex-end">
              <Button component={Link} href={`/admin/partners/${partner.id}`} variant="subtle" size="compact-sm">
                View
              </Button>
              <Button component={Link} href={`/admin/partners/${partner.id}/edit`} variant="subtle" size="compact-sm">
                Edit
              </Button>
            </Group>
          ),
        },
      ]}
      renderCard={(partner) => <PartnerMobileCard partner={partner} />}
      getRowKey={(partner) => partner.id}
    />
  );
}
