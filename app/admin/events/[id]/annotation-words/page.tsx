import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GdsStack } from '@sovereignsquad/gds-core/client';
import AnnotationVocabularyEditor from '@/components/admin/AnnotationVocabularyEditor';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { getSession } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongodb';
import { loadLevelForPage } from '@/lib/photo-vetting/vocabulary-level';

export const dynamic = 'force-dynamic';

// WHAT: The vetting words of an event (issue 628): the words the reviewer describes a photo with at this event, above the partner's and the general level. Managers of the event's partner and global admins.
// WHY: the same editor as the general level and the partner; the event changes only what it wants to, and follows the partner for the rest. It is its own page so the Vetting tab stays the photos.
export default async function EventAnnotationWordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const result = await loadLevelForPage(await connectToDatabase(), session!, 'event', id);
  if (!result.ok) {
    if (result.status === 403) redirect(`/admin/events/${id}`);
    notFound();
  }
  const name = result.view.name ?? 'Event';
  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/events">Events</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/events/${id}`}>{name}</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/events/${id}/vetting`}>Vetting</Link>
        <span aria-hidden> / </span>
        <span>Vetting words</span>
      </nav>
      <WorkspaceHeader
        eyebrow="Events"
        title={`Vetting words: ${name}`}
        description="The words the reviewer describes a photo with at this event. An option you do not change follows the partner, which follows the general level."
      />
      <AnnotationVocabularyEditor level="event" id={id} initial={result.view} />
    </GdsStack>
  );
}
