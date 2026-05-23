'use client';

import Link from 'next/link';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import DataTable from '@/components/gds/DataTable';
import StatusBadge from '@/components/gds/StatusBadge';
import ResponsiveDataView from '@/components/gds/ResponsiveDataView';
import StateBlock from '@/components/gds/StateBlock';

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
            c="blue.7"
            lineClamp={2}
            style={{ textDecoration: 'none', minWidth: 0 }}
          >
            {partner.name}
          </Text>
          <StatusBadge tone={partner.isActive ? 'active' : 'inactive'} />
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
            <Button component={Link} href="/admin/partners/new" color="cameraTeal">
              Add Your First Partner
            </Button>
          }
        />
      </Card>
    );
  }

  const tableColumns = [
    { key: 'partner', title: 'Partner Name' },
    { key: 'events', title: 'Events' },
    { key: 'frames', title: 'Frames' },
    { key: 'users', title: 'Users' },
    { key: 'status', title: 'Status' },
    { key: 'created', title: 'Created' },
    { key: 'actions', title: 'Actions', align: 'right' as const },
  ];

  return (
    <ResponsiveDataView
      table={
        <DataTable columns={tableColumns}>
          {partners.map((partner) => (
            <tr key={partner.id} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
              <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                <Stack gap={2}>
                  <Text
                    component={Link}
                    href={`/admin/partners/${partner.id}`}
                    fw={700}
                    c="blue.7"
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
              </td>
              <td style={{ padding: '1rem 1.5rem' }}>{partner.eventCount}</td>
              <td style={{ padding: '1rem 1.5rem' }}>{partner.frameCount}</td>
              <td style={{ padding: '1rem 1.5rem' }}>{partner.userAccessCount}</td>
              <td style={{ padding: '1rem 1.5rem' }}>
                <StatusBadge tone={partner.isActive ? 'active' : 'inactive'} />
              </td>
              <td style={{ padding: '1rem 1.5rem' }}>
                <Text size="sm" c="dimmed">
                  {partner.createdAtLabel}
                </Text>
              </td>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                <Group gap="sm" justify="flex-end">
                  <Button component={Link} href={`/admin/partners/${partner.id}`} variant="subtle" size="compact-sm">
                    View
                  </Button>
                  <Button component={Link} href={`/admin/partners/${partner.id}/edit`} variant="subtle" size="compact-sm">
                    Edit
                  </Button>
                </Group>
              </td>
            </tr>
          ))}
        </DataTable>
      }
      mobile={partners.map((partner) => (
        <PartnerMobileCard key={partner.id} partner={partner} />
      ))}
    />
  );
}
