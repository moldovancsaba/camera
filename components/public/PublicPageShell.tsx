'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEventTheme } from '@/components/theme/EventThemeScope';
import { Box } from '@/components/gds/PublicPrimitives';
import { PublicShell as GdsPublicShell, SectionPanel } from '@sovereignsquad/gds-core/client';

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
  // On the page of an event the header shows the event's logo (else its emoji) instead of the product name (camera#285).
  const theme = useEventTheme();
  const brand = theme?.logoUrl ? (
    <Image src={theme.logoUrl} alt="Event logo" width={160} height={48} unoptimized style={{ maxHeight: 44, maxWidth: 160, height: 'auto', width: 'auto' }} />
  ) : theme?.emoji ? (
    <span aria-hidden="true" style={{ fontSize: 32, lineHeight: 1 }}>
      {theme.emoji}
    </span>
  ) : (
    <Link href="/" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 800 }}>
      Camera
    </Link>
  );

  return (
    <GdsPublicShell
      brand={brand}
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
