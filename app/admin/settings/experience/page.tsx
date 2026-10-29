import { redirect } from 'next/navigation';
import GlobalExperienceDefaultsView from '@/components/admin/GlobalExperienceDefaultsView';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';

export const dynamic = 'force-dynamic';

export default async function GlobalExperienceDefaultsPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) redirect('/admin');
  return <GlobalExperienceDefaultsView />;
}
