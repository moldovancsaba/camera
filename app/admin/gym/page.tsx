/**
 * Admin: Gym module hub (lessons feed the member /gym experience).
 */

import Link from 'next/link';

export default function AdminGymHubPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gym module</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Manage lesson content. Members use the same SSO session, app roles, and imgbb uploads as the rest of
        Camera.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link
          href="/admin/gym/funfitfan"
          className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
        >
          FunFitFan settings
        </Link>
        <Link
          href="/admin/gym/lessons"
          className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Lessons
        </Link>
        <Link
          href="/gym"
          className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Open member Gym
        </Link>
      </div>
    </div>
  );
}
