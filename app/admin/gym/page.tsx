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
      <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">FunFitFan Experience</p>
          <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
            Partner-scoped Gym experience that uses Camera events, frames, submissions, and slideshow resources under
            the hood.
          </p>
          <div className="mt-4">
            <Link
              href="/admin/gym/funfitfan"
              className="inline-flex rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              Open FunFitFan
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
              Open Training Content
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
