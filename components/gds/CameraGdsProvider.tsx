'use client';

import type { MantineThemeOverride } from '@mantine/core';
import { GdsProvider } from '@doneisbetter/gds-theme/client';

export default function CameraGdsProvider({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: MantineThemeOverride;
}) {
  return (
    <GdsProvider theme={theme} defaultColorScheme="light">
      {children}
    </GdsProvider>
  );
}
