'use client';

import Link from 'next/link';
import { SidebarNavItem } from '@doneisbetter/gds-core/client';

interface SemanticNavLinkProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onNavigate?: () => void;
  onClick?: () => void;
}

export default function SemanticNavLink({
  href,
  label,
  icon,
  active,
  onNavigate,
  onClick,
}: SemanticNavLinkProps) {
  return (
    <SidebarNavItem
      component={Link}
      href={href}
      onClick={() => {
        onClick?.();
        onNavigate?.();
      }}
      active={active}
      label={label}
      icon={icon}
      aria-current={active ? 'page' : undefined}
    />
  );
}
