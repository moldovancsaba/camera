'use client';

import { use } from 'react';
import Link from 'next/link';
import { GdsStack } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import SampleSelfiePanel from '@/components/admin/SampleSelfiePanel';
import TaggedSlotPanel from '@/components/admin/TaggedSlotPanel';

type Scope = 'partner' | 'event';
type Kind = 'selfie' | 'stadium';

const DETAILS: Record<Scope, Record<Kind, { title: string; description: string }>> = {
  partner: {
    selfie: { title: 'Partner Selfies', description: 'Choose the sample selfie inherited by the partner’s events until an event chooses its own.' },
    stadium: { title: 'Partner Stadiums', description: 'Choose the stadium backgrounds inherited by the partner’s events until an event chooses its own.' },
  },
  event: {
    selfie: { title: 'Event Selfies', description: 'Choose the sample selfie used by this event’s welcome screen.' },
    stadium: { title: 'Event Stadiums', description: 'Choose the stadium background used by this event’s default slideshow stage.' },
  },
};

export default function ScopedPictureSlotPage({ params, scope, kind }: { params: Promise<{ id: string }>; scope: Scope; kind: Kind }) {
  const { id } = use(params);
  const noun = scope === 'partner' ? 'Partners' : 'Events';
  const details = DETAILS[scope][kind];

  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href={`/admin/${noun.toLowerCase()}`}>{noun}</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/admin/${noun.toLowerCase()}/${id}`}>{scope === 'partner' ? 'Partner' : 'Event'} overview</Link>
        <span aria-hidden="true"> / </span>
        <span>{details.title}</span>
      </nav>
      <WorkspaceHeader eyebrow={noun} title={details.title} description={details.description} />
      {kind === 'selfie' ? <SampleSelfiePanel level={scope} id={id} /> : <TaggedSlotPanel kind="stadium" level={scope} id={id} />}
    </GdsStack>
  );
}
