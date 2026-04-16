import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function FffLogLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/api/auth/login');
  }
  if (session.appAccess === false) {
    redirect('/');
  }
  return <>{children}</>;
}
