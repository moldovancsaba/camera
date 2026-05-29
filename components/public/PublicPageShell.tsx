'use client';

import Link from 'next/link';
import { Box } from '@mantine/core';
import { PublicShell as GdsPublicShell, SectionPanel } from '@doneisbetter/gds-core/client';

export interface PublicPageShellProps {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  centered?: boolean;
  padded?: boolean;
}

export default function PublicPageShell({
  children,
  size = 'lg',
  centered = false,
  padded = true,
}: PublicPageShellProps) {
  const maxContentWidth = size === 'xl' ? 'lg' : size;

  return (
    <GdsPublicShell
      brand={
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 800 }}>
          Camera
        </Link>
      }
      maxContentWidth={maxContentWidth}
    >
      <Box
        style={{
          minHeight: centered ? 'calc(100dvh - 10rem)' : undefined,
          display: 'flex',
          alignItems: centered ? 'center' : 'stretch',
        }}
      >
        <Box style={{ width: '100%' }}>
          {padded ? <SectionPanel divided={false}>{children}</SectionPanel> : children}
        </Box>
      </Box>
    </GdsPublicShell>
  );
}
