'use client';

import { GdsProvider } from '@doneisbetter/gds-theme/client';

export default function CameraGdsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GdsProvider defaultColorScheme="light">
      {children}
    </GdsProvider>
  );
}
