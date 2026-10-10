import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AllEventsAnalyticsPage from '@/components/admin/analytics/AllEventsAnalyticsPage';

export const dynamic = 'force-dynamic';

// The Analytics menu of Operations (issue 521): the numbers of every event together, for global admins. It lived at /admin/tryon/analytics, the address of
// the try-on report it used to be; that address is redirected here (next.config.ts) now that the try-on integration is removed (issue 557).
export default async function AdminAnalyticsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }
  return <AllEventsAnalyticsPage searchParams={searchParams ? await searchParams : {}} />;
}
