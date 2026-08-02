'use client';

import Link from 'next/link';
import { SidebarNavItem } from '@sovereignsquad/gds-core/client';

interface SemanticNavLinkProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick?: () => void;
  /** Guided-tour target id (lib/tour). Wraps the link in a plain div rather
   *  than prop-drilling data-tour-id into SidebarNavItem's own type surface. */
  tourId?: string;
}

export default function SemanticNavLink({
  href,
  label,
  icon,
  active,
  onClick,
  tourId,
}: SemanticNavLinkProps) {
  const link = (
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

  return tourId ? <div data-tour-id={tourId}>{link}</div> : link;
}
