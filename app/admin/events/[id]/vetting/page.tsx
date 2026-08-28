import AdminTryOnResultsPage from '@/app/admin/tryon-results/page';

export const dynamic = 'force-dynamic';

// WHAT: The event workspace's Vetting tab. WHY: reuses the exact same
// global vetting page/component, just supplying the event id from the route
// instead of a ?eventId= query param -- the underlying scoping, count tiles,
// and chip already resolve either the UUID or the Mongo _id (Phase 0), so
// this needs no logic of its own. Forwards the real query string (e.g.
// ?archive=greatest, ?queue=1) so links to a specific bucket work through
// this route too, not just through /admin/tryon/vetting directly.
export default async function EventVettingTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ reviewStatus?: string; search?: string; archive?: string; failed?: string; queue?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  return <AdminTryOnResultsPage searchParams={Promise.resolve({ ...resolvedSearchParams, eventId: id })} />;
}
