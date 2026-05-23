/**
 * Admin layout: sidebar + main content.
 * Access: middleware requires a valid session; layout resolves global or partner-scoped admin access.
 */

import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getAdminNavigationAccess } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminShell from '@/components/gds/AdminShell';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check authentication and authorization
  const session = await getSession();
  
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  if (session.appAccess === false) {
    redirect('/');
  }

  const db = await connectToDatabase();
  const navigationAccess = await getAdminNavigationAccess(db, session);
  if (!navigationAccess.isGlobalAdmin && !navigationAccess.hasAnyPartnerAccess) {
    redirect('/');
  }

  return (
    <AdminShell session={session} navigationAccess={navigationAccess}>
      {children}
    </AdminShell>
  );
}
