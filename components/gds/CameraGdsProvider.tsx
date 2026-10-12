'use client';

import {
  GdsConfirmProvider,
  GdsNotificationProvider,
  GdsTelemetryProvider,
  OverlayManagerProvider,
} from '@sovereignsquad/gds-core/client';
import { GdsProvider } from '@sovereignsquad/gds-theme/client';

/**
 * There is no `GdsToastProvider` on purpose (issue 229): `useGdsToasts()` drew nothing because no `GdsNotificationCenter` is mounted. Notices go
 * through `showGdsNotification` (Mantine's host, mounted by `GdsProvider`): `components/admin/notify.ts` for the admin, `components/capture/notify.ts`
 * for the user's capture pages. `components/admin/notify.test.ts` fails if `useGdsToasts` comes back.
 */
export default function CameraGdsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GdsProvider
      defaultColorScheme="light"
      cssVariablesSelector=":root"
      applyDocumentColorScheme
    >
      <GdsTelemetryProvider>
        <GdsNotificationProvider>
          <OverlayManagerProvider>
            <GdsConfirmProvider>{children}</GdsConfirmProvider>
          </OverlayManagerProvider>
        </GdsNotificationProvider>
      </GdsTelemetryProvider>
    </GdsProvider>
  );
}
