'use client';

import Link from 'next/link';
import { NavLink } from '@mantine/core';

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
    <NavLink
      component={Link}
      href={href}
      onClick={() => {
        onClick?.();
        onNavigate?.();
      }}
      active={active}
      label={label}
      leftSection={icon}
      variant={active ? 'light' : 'subtle'}
      color="teal"
      styles={{
        root: {
          borderRadius: 14,
        },
        label: {
          fontWeight: active ? 700 : 600,
          color: active
            ? 'var(--mantine-color-teal-8)'
            : 'var(--mantine-color-gray-8)',
        },
        section: {
          color: active
            ? 'var(--mantine-color-teal-7)'
            : 'var(--mantine-color-gray-7)',
        },
      }}
    />
  );
}
