'use client';

import CameraGdsProvider from '@/components/gds/CameraGdsProvider';
import { cameraMantineTheme } from '@/lib/gds/theme';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <CameraGdsProvider theme={cameraMantineTheme}>{children}</CameraGdsProvider>;
}
