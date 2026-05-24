/**
 * Admin layout: sidebar + main content.
 */

import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getAdminNavigationAccess, isGlobalAdminSession } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminShell from '@/components/gds/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  if (session.appAccess === false) {
    redirect('/');
  }

  let navigationAccess = {
    isGlobalAdmin: isGlobalAdminSession(session),
    hasAnyPartnerAccess: isGlobalAdminSession(session),
    hasEventsAccess: isGlobalAdminSession(session),
  };

  try {
    const db = await connectToDatabase();
    navigationAccess = await getAdminNavigationAccess(db, session);
  } catch (error) {
    console.error('Error resolving admin navigation access:', error);
    if (!navigationAccess.isGlobalAdmin) {
      redirect('/');
    }
  }

  if (!navigationAccess.isGlobalAdmin && !navigationAccess.hasAnyPartnerAccess) {
    redirect('/');
  }

  return (
    <AdminShell
      session={{
        user: {
          name: session.user.name,
          email: session.user.email,
        },
        appRole: session.appRole,
      }}
      navigationAccess={navigationAccess}
    >
      {children}
    </AdminShell>
  );
}
