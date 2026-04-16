/**
 * Admin: create gym lesson (client form → /api/admin/gym/lessons).
 */

import Link from 'next/link';
import AdminNewLessonForm from '@/components/gym/AdminNewLessonForm';

export default function AdminNewGymLessonPage() {
  return (
    <div className="p-8">
      <Link href="/admin/gym/lessons" className="text-sm text-gray-600 hover:underline dark:text-gray-400">
        ← Lessons
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">New lesson</h1>
      <p className="mt-2 max-w-xl text-gray-600 dark:text-gray-400">
        Steps are JSON array, e.g.{' '}
        <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">
          [&#123;&quot;title&quot;:&quot;Warm-up&quot;,&quot;detail&quot;:&quot;5 min bike&quot;&#125;,&#123;&quot;title&quot;:&quot;Squats&quot;&#125;]
        </code>
      </p>
      <div className="mt-8 max-w-xl">
        <AdminNewLessonForm />
      </div>
    </div>
  );
}
