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
    selfie: { title: 'Partner Selfies', description: 'Optional sample photos for the welcome-screen preview. An event uses these only when its editor chooses the partner default. They do not appear in the slideshow; add slideshow photos in Event Gallery.' },
    stadium: { title: 'Partner Stadiums', description: 'Choose the stadium backgrounds inherited by the partner’s events until an event chooses its own.' },
  },
  event: {
    selfie: { title: 'Event Selfies', description: 'Optional sample photo for this event’s welcome-screen preview. New events start with no sample selected. Slideshow photos are managed separately in Event Gallery.' },
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
