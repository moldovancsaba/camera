'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button, Card, SimpleGrid, Stack, Text } from '@mantine/core';
import { StateBlock, StatusBadge } from '@doneisbetter/gds-core/client';
import { getStatusBadgeProps } from '@/lib/gds/presentation';

export interface SerializedLogoRow {
  id: string;
  logoId: string;
  name: string;
  description?: string | null;
  imageUrl: string;
  isActive: boolean;
  usageCount: number;
  partnerDefaultCount: number;
  eventAssignmentCount: number;
  primaryPartnerAdminId?: string | null;
  primaryPartnerName?: string | null;
  primaryEventAdminId?: string | null;
  primaryEventName?: string | null;
}

export default function LogosInventoryList({ logos }: { logos: SerializedLogoRow[] }) {
  if (logos.length === 0) {
    return (
      <Card p="xl">
        <StateBlock
          variant="empty"
          title="No logos yet"
          description="Upload your first shared logo to start assigning it across partners and apps."
          action={
            <Button component={Link} href="/admin/logos/new">
              Upload Shared Logo
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
      {logos.map((logo) => (
        <Card key={logo.logoId} p={0} style={{ overflow: 'hidden' }}>
          <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--mantine-color-gray-1)' }}>
            <Image
              src={logo.imageUrl}
              alt={logo.name}
              fill
              style={{ objectFit: 'contain', padding: 16 }}
              unoptimized
            />
            <div style={{ position: 'absolute', top: 8, right: 8 }}>
              <StatusBadge {...getStatusBadgeProps(logo.isActive ? 'active' : 'inactive')} />
            </div>
          </div>
          <Stack gap="sm" p="md">
            <Text fw={700} truncate="end">
              {logo.name}
            </Text>
            {logo.description ? (
              <Text size="sm" c="dimmed" lineClamp={2}>
                {logo.description}
              </Text>
            ) : null}
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Partner defaults: {logo.partnerDefaultCount}
              </Text>
              <Text size="xs" c="dimmed">
                Event assignments: {logo.eventAssignmentCount}
              </Text>
              <Text size="xs" c="dimmed">
                Usage counter: {logo.usageCount}
              </Text>
              {logo.primaryPartnerAdminId && logo.primaryPartnerName ? (
                <Text size="xs" c="dimmed">
                  Partner:{' '}
                  <Text
                    component={Link}
                    href={`/admin/partners/${logo.primaryPartnerAdminId}`}
                    span
                    c="blue.7"
                    style={{ textDecoration: 'none' }}
                  >
                    {logo.primaryPartnerName}
                  </Text>
                </Text>
              ) : null}
              {!logo.primaryPartnerAdminId && logo.primaryEventAdminId && logo.primaryEventName ? (
                <Text size="xs" c="dimmed">
                  Event:{' '}
                  <Text
                    component={Link}
                    href={`/admin/events/${logo.primaryEventAdminId}`}
                    span
                    c="blue.7"
                    style={{ textDecoration: 'none' }}
                  >
                    {logo.primaryEventName}
                  </Text>
                </Text>
              ) : null}
              {!logo.primaryPartnerAdminId && !logo.primaryEventAdminId ? (
                <Text size="xs" c="dimmed">
                  Unassigned shared logo
                </Text>
              ) : null}
            </Stack>
            <Button component={Link} href={`/admin/logos/${logo.id}/edit`} fullWidth>
              Edit
            </Button>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}
