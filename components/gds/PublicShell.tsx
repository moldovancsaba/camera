'use client';

import PublicSurfaceShell from '@/components/gds/PublicSurfaceShell';

export interface PublicShellProps {
  children: React.ReactNode;
  size?: string | number;
  centered?: boolean;
  padded?: boolean;
}

export default function PublicShell(props: PublicShellProps) {
  return <PublicSurfaceShell {...props} />;
}
