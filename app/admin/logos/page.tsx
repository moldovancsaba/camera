/**
 * Logos Admin Page
 * 
 * List all uploaded logos with grid view
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Logo {
  _id: string;
  logoId: string;
  name: string;
  description?: string;
  imageUrl: string;
  thumbnailUrl: string;
  isActive: boolean;
  usageCount?: number;
  createdAt: string;
}

export default function LogosPage() {
  const [logos, setLogos] = useState<Logo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogos = async () => {
      try {
        console.log('Fetching logos from API...');
        const response = await fetch('/api/logos?limit=100');
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load logos');
        }

        console.log('Logos from data.logos:', data.logos);
        console.log('Logos from data.data.logos:', data.data?.logos);
        setLogos(data.logos || data.data?.logos || []);
      } catch (err: any) {
        console.error('Error fetching logos:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogos();
  }, []);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600 dark:text-gray-400">Loading logos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Logos</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage logos for event scenarios
          </p>
        </div>
        <Link
          href="/admin/logos/new"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Upload Logo
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      {logos.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-6xl mb-4">🎨</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No logos yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Upload your first logo to get started
          </p>
          <Link
            href="/admin/logos/new"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upload Logo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {logos.map((logo) => (
            <div
              key={logo.logoId}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="relative aspect-square bg-gray-100 dark:bg-gray-700">
                <Image
                  src={logo.imageUrl}
                  alt={logo.name}
                  fill
                  className="object-contain p-4"
                  unoptimized
                />
                <div className="absolute top-2 right-2">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      logo.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {logo.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1 truncate">
                  {logo.name}
                </h3>
                {logo.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                    {logo.description}
                  </p>
                )}
                <div className="text-xs text-gray-500 dark:text-gray-500 mb-3">
                  Used in {logo.usageCount || 0} event{logo.usageCount !== 1 ? 's' : ''}
                </div>
                <Link
                  href={`/admin/logos/${logo._id}/edit`}
                  className="inline-block w-full text-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
