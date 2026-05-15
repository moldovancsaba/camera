/**
 * Admin: Gym app hub (training feeds the member /workout experience).
 */

import { getSession } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongodb';
import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';
import { getPartnerScopedAccessForPartner, isGlobalAdminSession } from '@/lib/partners/authorization';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function AdminGymHubPage() {
  const session = await getSession();
  const db = await connectToDatabase();
  const viewerAccess = await getPartnerScopedAccessForPartner(db, session!, FUNFITFAN_PARTNER_ID, 'gym');
  if (!viewerAccess.allowed) {
    redirect('/admin/partners');
  }
  const canManageGym = isGlobalAdminSession(session)
    ? true
    : (await getPartnerScopedAccessForPartner(db, session!, FUNFITFAN_PARTNER_ID, 'gym', 'manager')).allowed;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gym App</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Manage the workout app surfaces that run on top of Camera Core resources. Gym uses the same SSO session,
        partner context, frames, slideshows, submissions, and uploads as the rest of Camera.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Gym Settings</p>
          <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
            Configure the current Gym member experience, including default framing and activity options, using Camera
            Core resources under the hood.
          </p>
          <div className="mt-4">
            <Link
              href="/admin/gym/funfitfan"
              className="inline-flex rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              {canManageGym ? 'Open Gym Settings' : 'View Gym Settings'}
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Training Content</p>
          <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
            Lessons and workout content that feed Gym member flows.
          </p>
          <div className="mt-4">
            <Link
              href="/admin/gym/lessons"
              className="inline-flex rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              {canManageGym ? 'Open Training Content' : 'View Training Content'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
