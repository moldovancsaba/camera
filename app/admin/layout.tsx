/**
 * Admin layout: sidebar + main content.
 * Access: middleware requires a valid session with appRole `admin` or `superadmin`
 * (see `middleware.ts`); layout additionally requires any logged-in session.
 */

import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import CollapsibleSidebar from '@/components/admin/CollapsibleSidebar';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check authentication and authorization
  const session = await getSession();
  
  if (!session) {
    redirect('/api/auth/login');
  }
  
  // WHAT: Check app-specific role (appRole), NOT SSO-level role (user.role)
  // WHY: SSO v5.24.0 introduced multi-app permissions - each app has its own roles
  // HOW: Use session.appRole which was queried from SSO during login callback
  if (session.appRole !== 'admin' && session.appRole !== 'superadmin') {
    redirect('/');
  }

  if (session.appAccess === false) {
    redirect('/');
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <CollapsibleSidebar session={session} />
      
      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
