/**
 * Admin: Gym app hub (training feeds the member /workout experience).
 */

import Link from 'next/link';

export default function AdminGymHubPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gym App</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Manage the workout app surfaces that run on top of Camera Core resources. Gym uses the same SSO session,
        partner context, frames, slideshows, submissions, and uploads as the rest of Camera.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link
          href="/admin/gym/funfitfan"
          className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
        >
          FunFitFan app settings
        </Link>
        <Link
          href="/admin/gym/lessons"
          className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Training content
        </Link>
      </div>
    </div>
  );
}
