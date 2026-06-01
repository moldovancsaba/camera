'use client';

import CameraGdsProvider from '@/components/gds/CameraGdsProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <CameraGdsProvider>{children}</CameraGdsProvider>;
}
