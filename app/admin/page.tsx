/**
 * Admin Dashboard
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminDashboardView from '@/components/gds/AdminDashboardView';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let framesCount = 0;
  let submissionsCount = 0;
  let dbError = null;

  try {
    const db = await connectToDatabase();
    [framesCount, submissionsCount] = await Promise.all([
      db.collection('frames').countDocuments(),
      db.collection('submissions').countDocuments(),
    ]);
  } catch (error) {
    console.error('Error connecting to database:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminDashboardView
      framesCount={framesCount}
      submissionsCount={submissionsCount}
      dbError={dbError}
    />
  );
}
