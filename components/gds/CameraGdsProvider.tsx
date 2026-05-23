'use client';

import {
  ColorSchemeScript,
  MantineProvider,
  localStorageColorSchemeManager,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { cameraMantineTheme } from '@/lib/gds/theme';

const colorSchemeManager = localStorageColorSchemeManager({
  key: 'camera-mantine-color-scheme',
});

export function CameraColorSchemeScript() {
  return <ColorSchemeScript defaultColorScheme="light" />;
}

export default function CameraGdsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MantineProvider
      theme={cameraMantineTheme}
      defaultColorScheme="light"
      colorSchemeManager={colorSchemeManager}
    >
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}
