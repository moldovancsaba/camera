'use client';

import { use } from 'react';
import Link from 'next/link';
import { GdsStack } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import DefaultSlotsPanel from '@/components/admin/DefaultSlotsPanel';
import FrameSlotsPanel from '@/components/admin/FrameSlotsPanel';

export default function ScopedFrameSlotsPage({ params, scope }: { params: Promise<{ id: string }>; scope: 'partner' | 'event' }) {
  const { id } = use(params);
  const noun = scope === 'partner' ? 'Partners' : 'Events';
  const title = scope === 'partner' ? 'Partner Frame Slots' : 'Event Frame Slots';

  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href={`/admin/${noun.toLowerCase()}`}>{noun}</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/admin/${noun.toLowerCase()}/${id}`}>{scope === 'partner' ? 'Partner' : 'Event'} overview</Link>
        <span aria-hidden="true"> / </span>
        <span>{title}</span>
      </nav>
      <WorkspaceHeader
        eyebrow={noun}
        title={title}
        description={scope === 'partner'
          ? 'Set the generated-frame slots inherited by this partner’s events until an event sets its own.'
          : 'Set the slots used to compose this event’s generated frames. Reset to follow the partner or global default.'}
      />
      {scope === 'partner'
        ? <DefaultSlotsPanel level={{ scope: 'partner', partnerMongoId: id }} />
        : <FrameSlotsPanel eventId={id} />}
    </GdsStack>
  );
}
