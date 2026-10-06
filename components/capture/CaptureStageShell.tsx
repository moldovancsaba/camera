'use client';

import Image from 'next/image';
import { PublicFlowShell, type PublicFlowStageStatus } from '@sovereignsquad/gds-core/client';
import { Stack } from '@mantine/core';
import { useEventTheme } from '@/components/theme/EventThemeScope';

interface CaptureStageShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** The event's own logo for this page; when there is none the theme's logo (the partner's), else the event's emoji, is shown. */
  logoUrl?: string | null;
  /** Kept for the callers; the guest page shows no flow label. */
  eyebrow?: React.ReactNode;
  notice?: React.ReactNode;
  status?: PublicFlowStageStatus;
}

/**
 * One stage of the guest journey (login, consent, call to action, restart): the event's logo on top, the stage card under it, centred on the
 * page, drawn with the theme of the event (camera#285).
 */
export default function CaptureStageShell({ title, description, children, logoUrl, notice, status = 'ready' }: CaptureStageShellProps) {
  const theme = useEventTheme();
  const logo = logoUrl ?? theme?.logoUrl ?? null;
  const emoji = !logo ? theme?.emoji ?? null : null;

  return (
    <div className="app-safe-pad flex min-h-dvh w-full items-center justify-center p-4">
      <Stack align="center" gap="lg" className="w-full max-w-xl" data-event-stage>
        {logo ? (
          <Image
            src={logo}
            alt="Event logo"
            width={320}
            height={128}
            unoptimized
            style={{ maxHeight: 112, maxWidth: 280, height: 'auto', width: 'auto' }}
          />
        ) : emoji ? (
          <span aria-hidden="true" style={{ fontSize: 72, lineHeight: 1 }}>
            {emoji}
          </span>
        ) : null}
        <div className="w-full">
          <PublicFlowShell
            stage={{
              id: 'capture-stage',
              title,
              description,
              status,
              body: <Stack gap="md">{children}</Stack>,
              notice,
            }}
          />
        </div>
      </Stack>
    </div>
  );
}
