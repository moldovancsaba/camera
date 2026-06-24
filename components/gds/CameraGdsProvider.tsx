'use client';

import {
  GdsConfirmProvider,
  GdsNotificationProvider,
  GdsTelemetryProvider,
  GdsToastProvider,
  OverlayManagerProvider,
} from '@doneisbetter/gds-core/client';
import { GdsProvider } from '@doneisbetter/gds-theme/client';

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
          <GdsToastProvider>
            <OverlayManagerProvider>
              <GdsConfirmProvider>{children}</GdsConfirmProvider>
            </OverlayManagerProvider>
          </GdsToastProvider>
        </GdsNotificationProvider>
      </GdsTelemetryProvider>
    </GdsProvider>
  );
}
