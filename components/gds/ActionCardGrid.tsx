import Link from 'next/link';
import { Card, Group, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';

export interface ActionCardItem {
  href: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export default function ActionCardGrid({ items }: { items: ActionCardItem[] }) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <Card>
            <Group align="flex-start" gap="md" wrap="nowrap">
              {item.icon ? (
                <ThemeIcon color="cameraTeal" variant="light" size={44} radius="xl">
                  {item.icon}
                </ThemeIcon>
              ) : null}
              <Stack gap={4}>
                <Text fw={700} c="dark.8">
                  {item.title}
                </Text>
                {item.description ? (
                  <Text size="sm" c="dimmed">
                    {item.description}
                  </Text>
                ) : null}
              </Stack>
            </Group>
          </Card>
        </Link>
      ))}
    </SimpleGrid>
  );
}
