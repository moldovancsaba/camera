'use client';

import Link from 'next/link';
import { SidebarNavItem } from '@sovereignsquad/gds-core/client';

interface SemanticNavLinkProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick?: () => void;
}

export default function SemanticNavLink({
  href,
  label,
  icon,
  active,
  onClick,
}: SemanticNavLinkProps) {
  return (
    <SidebarNavItem
      component={Link}
      href={href}
      onClick={() => {
        onClick?.();
      }}
      active={active}
      label={label}
      icon={icon}
      aria-current={active ? 'page' : undefined}
    />
  );
}
