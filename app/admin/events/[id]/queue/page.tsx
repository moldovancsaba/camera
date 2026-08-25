import AdminTryOnQueuePage from '@/app/admin/tryon/queue/page';

export const dynamic = 'force-dynamic';

// See vetting/page.tsx in this same directory for why this is a thin
// delegate rather than its own implementation.
export default async function EventQueueTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminTryOnQueuePage searchParams={Promise.resolve({ eventId: id })} />;
}
