'use client';

import Link from 'next/link';
import { Badge, Button, Group, Stack, Text, Title } from '@mantine/core';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';

interface WorkspaceHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: string;
  primaryAction?: { href: string; label: string; iconKey?: AdminIconKey };
  actions?: React.ReactNode;
}

export default function WorkspaceHeader({
  eyebrow,
  title,
  description,
  status,
  primaryAction,
  actions,
}: WorkspaceHeaderProps) {
  const actionSlot =
    actions ??
    (primaryAction ? (
      <Button
        component={Link}
        href={primaryAction.href}
        color="cameraTeal"
        leftSection={primaryAction.iconKey ? <AdminIcon iconKey={primaryAction.iconKey} size={16} /> : undefined}
      >
        {primaryAction.label}
      </Button>
    ) : null);

  return (
    <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
      <Stack gap="xs">
        {eyebrow ? (
          <Text
            tt="uppercase"
            fw={700}
            fz="xs"
            c="gray.6"
            style={{ letterSpacing: '0.12em' }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Group gap="sm" align="center">
          <Title order={1} c="dark.8">
            {title}
          </Title>
          {status ? <Badge color="cameraTeal">{status}</Badge> : null}
        </Group>
        {description ? (
          <Text c="gray.7" maw={760}>
            {description}
          </Text>
        ) : null}
      </Stack>
      {actionSlot ? <Group gap="sm">{actionSlot}</Group> : null}
    </Group>
  );
}
