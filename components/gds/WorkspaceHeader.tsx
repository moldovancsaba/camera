import { Badge, Group, Stack, Text, Title } from '@mantine/core';

interface WorkspaceHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: string;
  actions?: React.ReactNode;
}

export default function WorkspaceHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
}: WorkspaceHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
      <Stack gap="xs">
        {eyebrow ? (
          <Text tt="uppercase" fw={700} fz="xs" c="dimmed" style={{ letterSpacing: '0.12em' }}>
            {eyebrow}
          </Text>
        ) : null}
        <Group gap="sm" align="center">
          <Title order={1}>{title}</Title>
          {status ? <Badge color="cameraTeal">{status}</Badge> : null}
        </Group>
        {description ? (
          <Text c="dimmed" maw={760}>
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions ? <Group gap="sm">{actions}</Group> : null}
    </Group>
  );
}
