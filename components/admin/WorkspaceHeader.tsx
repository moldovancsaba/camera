'use client';

import Link from 'next/link';
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
      <Link
        href={primaryAction.href}
        style={{ alignItems: 'center', display: 'inline-flex', gap: 8 }}
      >
        {primaryAction.iconKey ? <AdminIcon iconKey={primaryAction.iconKey} size={16} /> : null}
        {primaryAction.label}
      </Link>
    ) : null);

  return (
    <GdsPageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      status={status ? <span>{status}</span> : undefined}
      primaryAction={primaryActionSlot}
    />
  );
}
