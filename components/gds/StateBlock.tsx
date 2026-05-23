import { Alert, Center, Loader, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconLock } from '@tabler/icons-react';

export type StateBlockVariant = 'loading' | 'empty' | 'error' | 'permission';

export interface StateBlockProps {
  variant: StateBlockVariant;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function StateBlock({ variant, title, description, action }: StateBlockProps) {
  if (variant === 'loading') {
    return (
      <Center py="xl">
        <Stack align="center" gap="md">
          <Loader color="cameraTeal" type="dots" />
          <Text c="dimmed">{title}</Text>
        </Stack>
      </Center>
    );
  }

  if (variant === 'error') {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} title={title}>
        {description ? <Text size="sm">{description}</Text> : null}
        {action ? <Stack mt="md">{action}</Stack> : null}
      </Alert>
    );
  }

  if (variant === 'permission') {
    return (
      <Alert color="yellow" icon={<IconLock size={16} />} title={title}>
        {description ? <Text size="sm">{description}</Text> : null}
        {action ? <Stack mt="md">{action}</Stack> : null}
      </Alert>
    );
  }

  return (
    <Stack align="center" gap="sm" py="xl">
      <Title order={3}>{title}</Title>
      {description ? (
        <Text c="dimmed" ta="center" maw={480}>
          {description}
        </Text>
      ) : null}
      {action}
    </Stack>
  );
}
