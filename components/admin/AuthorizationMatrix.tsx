import { Card, ScrollArea, Table, Text, Title } from '@mantine/core';

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
  const rows = ROWS.map((row) => (
    <Table.Tr key={row.label}>
      <Table.Td>
        <Text size="sm" fw={600}>
          {row.label}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {row.access}
        </Text>
      </Table.Td>
      {!compact ? (
        <Table.Td>
          <Text size="sm" c="dimmed">
            {row.scope}
          </Text>
        </Table.Td>
      ) : null}
      <Table.Td>
        <Text size="sm" c="dimmed">
          {row.inventory}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {row.actions}
        </Text>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Card p={0}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <Title order={3}>{title}</Title>
        <Text size="sm" c="dimmed" mt="xs">
          {description}
        </Text>
      </div>
      <ScrollArea>
        <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
          <Table.Thead bg="var(--mantine-color-gray-0)">
            <Table.Tr>
              <Table.Th>Role</Table.Th>
              <Table.Th>Visible Surfaces</Table.Th>
              {!compact ? <Table.Th>Scope</Table.Th> : null}
              <Table.Th>Global Inventory</Table.Th>
              <Table.Th>Mutations</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </ScrollArea>
    </Card>
  );
}
