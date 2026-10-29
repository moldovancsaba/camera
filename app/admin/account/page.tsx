import { redirect } from 'next/navigation';
import AccountSettingsForm from '@/components/admin/AccountSettingsForm';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
  const session = await getSession();
  if (!session || session.appAccess === false) redirect('/admin/login');

  return (
    <AccountSettingsForm
      identity={{
        name: typeof session.user.name === 'string' && session.user.name.trim() ? session.user.name : null,
        email: session.user.email,
      }}
    />
  );
}
