import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';

/** Keep old bookmarks on the unified per-photo AI result and human review flow. */
export default async function LegacyManualAnalysisRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  redirect('/admin/events/' + id + '/analysis?photos=analysed');
}
