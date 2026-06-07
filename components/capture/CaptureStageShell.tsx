'use client';

import Image from 'next/image';
import { PublicFlowShell, type PublicFlowStageStatus } from '@doneisbetter/gds-core/client';
import { Stack } from '@/components/gds/PublicPrimitives';

interface CaptureStageShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  logoUrl?: string | null;
  eyebrow?: React.ReactNode;
  notice?: React.ReactNode;
  status?: PublicFlowStageStatus;
}

export default function CaptureStageShell({
  title,
  description,
  children,
  logoUrl,
  eyebrow,
  notice,
  status = 'ready',
}: CaptureStageShellProps) {
  return (
    <PublicFlowShell
      eyebrow={eyebrow}
      stage={{
        id: 'capture-stage',
        title,
        description,
        status,
        body: <Stack gap="md">{children}</Stack>,
        aside: logoUrl ? (
          <div className="flex items-center justify-center">
            <Image
              src={logoUrl}
              alt="Event logo"
              width={320}
              height={128}
              unoptimized
              style={{ maxHeight: 128, maxWidth: 320, height: 'auto', width: 'auto' }}
            />
          </div>
        ) : undefined,
        notice,
      }}
    />
  );
}
