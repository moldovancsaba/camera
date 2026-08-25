import AdminTryOnResultsPage from '@/app/admin/tryon-results/page';

export const dynamic = 'force-dynamic';

// WHAT: The event workspace's Vetting tab. WHY: reuses the exact same
// global vetting page/component, just supplying the event id from the route
// instead of a ?eventId= query param -- the underlying scoping, count tiles,
// and chip already resolve either the UUID or the Mongo _id (Phase 0), so
// this needs no logic of its own.
export default async function EventVettingTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminTryOnResultsPage searchParams={Promise.resolve({ eventId: id })} />;
}
