import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GdsStack } from '@sovereignsquad/gds-core/client';
import AnnotationVocabularyEditor from '@/components/admin/AnnotationVocabularyEditor';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { getSession } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongodb';
import { loadLevelForPage } from '@/lib/photo-vetting/vocabulary-level';

export const dynamic = 'force-dynamic';

// WHAT: The vetting words of a partner (issue 628): the words the reviewer describes a photo with, for all events of the partner, above the general level. A manager of the partner and global admins.
// WHY: the same editor as the general level and the event; the partner changes only what it wants to, and its events follow it.
export default async function PartnerAnnotationWordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const result = await loadLevelForPage(await connectToDatabase(), session!, 'partner', id);
  if (!result.ok) {
    if (result.status === 403) redirect(`/admin/partners/${id}`);
    notFound();
  }
  const name = result.view.name ?? 'Partner';
  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/partners">Partners</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/partners/${id}`}>{name}</Link>
        <span aria-hidden> / </span>
        <span>Vetting words</span>
      </nav>
      <WorkspaceHeader
        eyebrow="Partners"
        title={`Vetting words: ${name}`}
        description={`The words the reviewer describes a photo with, for all events of ${name}. An option you do not change follows the general level. An event can change its own.`}
      />
      <AnnotationVocabularyEditor level="partner" id={id} initial={result.view} />
    </GdsStack>
  );
}
