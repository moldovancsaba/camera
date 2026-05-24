'use client';

import { Badge } from '@mantine/core';

type StatusTone = 'active' | 'inactive' | 'info' | 'warning' | 'danger';

const statusMap: Record<StatusTone, { color: string; labelPrefix?: string }> = {
  active: { color: 'green', labelPrefix: 'Active' },
  inactive: { color: 'gray', labelPrefix: 'Inactive' },
  info: { color: 'blue' },
  warning: { color: 'yellow' },
  danger: { color: 'red' },
};

export default function StatusBadge({
  tone,
  label,
}: {
  tone: StatusTone;
  label?: string;
}) {
  const config = statusMap[tone];
  return <Badge color={config.color}>{label ?? config.labelPrefix ?? tone}</Badge>;
}
