/**
 * Admin: Sport module hub (lessons feed the member /gym experience).
 */

import Link from 'next/link';

export default function AdminGymHubPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Sport module</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Manage lesson content and FunFitFan settings. Members use the same SSO session, app roles, and imgbb
        uploads as the rest of Camera.
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
      </div>
    </div>
  );
}
