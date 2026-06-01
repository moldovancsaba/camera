'use client';

import Link from 'next/link';
import { Badge, Button } from '@mantine/core';
import { PageHeader as GdsPageHeader } from '@doneisbetter/gds-admin/client';
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
  const primaryActionSlot =
    actions ??
    (primaryAction ? (
      <Button
        component={Link}
        href={primaryAction.href}
        leftSection={primaryAction.iconKey ? <AdminIcon iconKey={primaryAction.iconKey} size={16} /> : undefined}
      >
        {primaryAction.label}
      </Button>
    ) : null);

  return (
    <GdsPageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      status={status ? <Badge>{status}</Badge> : undefined}
      primaryAction={primaryActionSlot}
    />
  );
}
