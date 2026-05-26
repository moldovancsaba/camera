import { Card, Group, Stack, Text, Title } from '@/components/gds/ui';

interface AuthorizationMatrixProps {
  title?: string;
  description?: string;
  compact?: boolean;
}

const ROWS = [
  {
    label: 'Global superadmin / admin',
    access: 'All admin surfaces',
    scope: 'Global + partner bypass',
    inventory: 'Full inventory',
    actions: 'Full create/update/delete',
  },
  {
    label: 'Partner app admin',
    access: 'Assigned partner + app surfaces',
    scope: 'Single partner/app',
    inventory: 'No global inventory',
    actions: 'Full partner/app operations',
  },
  {
    label: 'Partner app manager',
    access: 'Assigned partner + app surfaces',
    scope: 'Single partner/app',
    inventory: 'No global inventory',
    actions: 'Create/update inside scope',
  },
  {
    label: 'Partner app viewer',
    access: 'Assigned partner + app surfaces',
    scope: 'Single partner/app',
    inventory: 'No global inventory',
    actions: 'Read-only',
  },
];

export default function AuthorizationMatrix({
  title = 'Permission Matrix',
  description = 'This is the implemented authorization model for the current admin shell.',
  compact = false,
}: AuthorizationMatrixProps) {
  return (
    <Card p={0}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <Title order={3}>{title}</Title>
        <Text size="sm" c="dimmed" mt="xs">
          {description}
        </Text>
      </div>
      <Stack gap={0}>
        {ROWS.map((row, index) => (
          <Group
            key={row.label}
            justify="space-between"
            align="flex-start"
            wrap="wrap"
            p="xl"
            style={index > 0 ? { borderTop: '1px solid var(--mantine-color-gray-2)' } : undefined}
          >
            <Stack gap={4} maw={260}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                Role
              </Text>
              <Text size="sm" fw={600}>
                {row.label}
              </Text>
            </Stack>
            <Stack gap={4} maw={260}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                Visible Surfaces
              </Text>
              <Text size="sm" c="dimmed">
                {row.access}
              </Text>
            </Stack>
            {!compact ? (
              <Stack gap={4} maw={220}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                  Scope
                </Text>
                <Text size="sm" c="dimmed">
                  {row.scope}
                </Text>
              </Stack>
            ) : null}
            <Stack gap={4} maw={220}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                Global Inventory
              </Text>
              <Text size="sm" c="dimmed">
                {row.inventory}
              </Text>
            </Stack>
            <Stack gap={4} maw={220}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                Mutations
              </Text>
              <Text size="sm" c="dimmed">
                {row.actions}
              </Text>
            </Stack>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
