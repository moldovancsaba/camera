/**
 * Admin Dashboard
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminDashboardView from '@/components/gds/AdminDashboardView';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { COLLECTIONS } from '@/lib/db/schemas';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let framesCount = 0;
  let submissionsCount = 0;
  let activeUsersCount = 0;
  let dbError = null;

  try {
    const db = await connectToDatabase();
    const [frames, submissions, activeAccessUsers] = await Promise.all([
      db.collection('frames').countDocuments(),
      db.collection('submissions').countDocuments(),
      db
        .collection(COLLECTIONS.PARTNER_USER_ACCESS)
        .distinct('userEmail', { isActive: true }),
    ]);
    framesCount = frames;
    submissionsCount = submissions;
    activeUsersCount = activeAccessUsers.filter((email) => typeof email === 'string' && email.trim().length > 0).length;
  } catch (error) {
    console.error('Error connecting to database:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminDashboardView
      framesCount={framesCount}
      submissionsCount={submissionsCount}
      activeUsersCount={activeUsersCount}
      dbError={dbError}
    />
  );
}
