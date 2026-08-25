import AdminTryOnAnalyticsPage from '@/app/admin/tryon/analytics/page';

export const dynamic = 'force-dynamic';

// See vetting/page.tsx in this same directory for why this is a thin
// delegate rather than its own implementation.
export default async function EventAnalyticsTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminTryOnAnalyticsPage searchParams={Promise.resolve({ eventId: id })} />;
}
