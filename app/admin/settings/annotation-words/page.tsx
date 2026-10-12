import { redirect } from 'next/navigation';
import { GdsStack } from '@sovereignsquad/gds-core/client';
import AnnotationVocabularyEditor from '@/components/admin/AnnotationVocabularyEditor';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { getSession } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongodb';
import { loadLevelForPage } from '@/lib/photo-vetting/vocabulary-level';

export const dynamic = 'force-dynamic';

// WHAT: The vetting words, the general level (issue 628): the words the reviewer describes a photo with (gender, age, emotion, items, and why a photo is rejected) that every partner and event
// uses until it changes them. Global admins.
// WHY: the list is configurable at the three levels like every other function; this is the top one, and it reads and saves through the same route as the partner and event pages.
export default async function GeneralAnnotationWordsPage() {
  const session = await getSession();
  const result = await loadLevelForPage(await connectToDatabase(), session!, 'general', null);
  if (!result.ok) redirect('/admin');
  return (
    <GdsStack gap="lg">
      <WorkspaceHeader
        eyebrow="Settings"
        title="Vetting words"
        description="The words the reviewer describes a photo with at vetting: who is in it, how they look, what they wear or hold and, for a rejected photo, why. Every partner and event uses these until it changes them; a partner can change them for all its events, and an event for itself."
      />
      <AnnotationVocabularyEditor level="general" id={null} initial={result.view} />
    </GdsStack>
  );
}
