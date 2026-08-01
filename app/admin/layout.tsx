/**
 * Admin layout: sidebar + main content.
 */

import { headers } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getAdminNavigationAccess, isGlobalAdminSession } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminShell from '@/components/admin/AdminChrome';

export const dynamic = 'force-dynamic';

// WHAT: Where an authenticated-but-not-authorized session lands.
// WHY: camera's OAuth callback (unlike messmass's) still creates a session
//     for a user without app access -- it just carries appAccess: false.
//     Sending that case back to "/" would bounce straight into
//     /admin/login, which sees a valid session and redirects to /admin,
//     which fails this same check again: an infinite loop. /admin/login
//     knows to NOT treat a no-access session as "already signed in" (see
//     its own session.appAccess check) specifically so this redirect is
//     safe to land there instead.
const NO_ACCESS_REDIRECT = '/admin/login?error=no_access';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // WHAT: This layout wraps every /admin/* page, /admin/login included --
  //     Next.js has no way to exclude one child route from an ancestor
  //     layout. /admin/login must render unauthenticated (it's the sign-in
  //     page itself), so skip this layout's auth gate for it specifically;
  //     it does its own session check. Without this, an unauthenticated
  //     visit here would redirect to /admin/login, which this same layout
  //     wraps, which would redirect to itself.
  const requestHeaders = await headers();
  if (requestHeaders.get('x-camera-pathname')?.startsWith('/admin/login')) {
    return children;
  }

  const session = await getSession();

  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  if (session.appAccess === false) {
    redirect(NO_ACCESS_REDIRECT);
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
      redirect(NO_ACCESS_REDIRECT);
    }
  }

  if (!navigationAccess.isGlobalAdmin && !navigationAccess.hasAnyPartnerAccess) {
    redirect(NO_ACCESS_REDIRECT);
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
