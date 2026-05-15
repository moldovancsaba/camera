'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface LandingPageListItem {
  _id: string;
  slug: string;
  title?: string | null;
  targetType: 'slideshow' | 'layout';
  targetName: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  eventMongoId: string;
  initialLandingPages: LandingPageListItem[];
}

export default function LandingPageManager({
  eventMongoId,
  initialLandingPages,
}: Props) {
  const [landingPages, setLandingPages] = useState(initialLandingPages);

  const handleDelete = async (mongoId: string) => {
    if (!confirm('Delete this landing page?')) return;
    try {
      const res = await fetch(`/api/landing-pages/${mongoId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setLandingPages((prev) => prev.filter((page) => page._id !== mongoId));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to delete landing page');
      }
    } catch {
      alert('Failed to delete landing page');
    }
  };

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/landing/${slug}`;
    navigator.clipboard.writeText(url);
    alert('Landing page URL copied to clipboard');
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              🌐 Experience Landing Pages
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Public experience surfaces for this event. They can embed a slideshow or layout and route visitors into app actions like capture.
            </p>
          </div>
          <Link
            href={`/admin/events/${eventMongoId}/landing-pages/new`}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            ➕ New landing page
          </Link>
        </div>
      </div>

      {landingPages.length === 0 ? (
        <div className="p-12 text-center">
          <div className="text-5xl mb-4">🌐</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No landing pages yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Create an experience page for this event and connect it to one slideshow or one layout
            </p>
        </div>
      ) : (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {landingPages.map((page) => (
              <div
                key={page._id}
                className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {page.title?.trim() || page.slug}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">
                      /landing/{page.slug}
                    </p>
                    <span
                      className={`inline-flex mt-2 px-2 py-1 text-xs font-semibold rounded-full ${
                        page.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {page.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(page._id)}
                    className="text-red-500 hover:text-red-700 text-sm shrink-0"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Embedded experience: {page.targetType === 'layout' ? 'Layout' : 'Slideshow'} · {page.targetName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Created {new Date(page.createdAt).toLocaleDateString()}
                  </div>
                  <Link
                    href={`/admin/events/${eventMongoId}/landing-pages/${page._id}`}
                    className="block w-full px-3 py-2 bg-emerald-600 text-white rounded text-sm font-semibold hover:bg-emerald-700 transition-colors text-center"
                  >
                    ✏️ Edit experience page
                  </Link>
                  <Link
                    href={`/landing/${page.slug}`}
                    target="_blank"
                    className="block w-full px-3 py-2 bg-gray-800 text-white rounded text-sm font-semibold hover:bg-gray-900 transition-colors text-center"
                  >
                    🌍 Open landing page
                  </Link>
                  <button
                    type="button"
                    onClick={() => copyUrl(page.slug)}
                    className="w-full px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    📋 Copy public URL
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
