'use client';

import { Alert, List, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';

export default function DatabaseConnectionAlert({ diagnosis }: { diagnosis: MongoConnectionDiagnosis }) {
  const { rawMessage, summary, hints } = diagnosis;

  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />}>
      <Text fw={700}>Database connection error</Text>
      <Text size="sm" mt="xs">
        {summary}
      </Text>
      <Text size="xs" mt="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
        {rawMessage}
      </Text>
      {hints.length > 0 ? (
        <List size="sm" mt="sm">
          {hints.map((hint, index) => (
            <List.Item key={index}>{hint}</List.Item>
          ))}
        </List>
      ) : null}
    </Alert>
  );
}
