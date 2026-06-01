'use client';

import type { ReactNode } from 'react';
import { modals } from '@mantine/modals';
import { Text } from '@mantine/core';

export interface ConfirmDestructiveOptions {
  title: string;
  message: ReactNode;
  targetName?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Standard destructive confirmation via Mantine modals (GDS feedback contract).
 */
export function confirmDestructive({
  title,
  message,
  targetName,
  confirmLabel = 'Delete',
  onConfirm,
}: ConfirmDestructiveOptions): void {
  modals.openConfirmModal({
    title,
    centered: true,
    labels: { confirm: confirmLabel, cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    children: (
      <Text c="dimmed" size="sm">
        {message}
        {targetName ? (
          <>
            {' '}
            <Text span fw={700}>
              {targetName}
            </Text>
          </>
        ) : null}
      </Text>
    ),
    onConfirm,
  });
}
