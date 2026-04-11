/**
 * Edit Partner Page
 * 
 * Form to edit partner details
 * v2.8.0: Added default style settings for child events
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function EditPartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partner, setPartner] = useState<any>(null);
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [secondaryColor, setSecondaryColor] = useState('#3B82F6');

  // Unwrap params
  useEffect(() => {
    params.then(p => setPartnerId(p.id));
  }, [params]);

  // Fetch partner data on mount
  useEffect(() => {
    if (!partnerId) return;

    const fetchPartner = async () => {
      try {
        const response = await fetch(`/api/partners/${partnerId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load partner');
        }

        setPartner(data.partner);
        setPrimaryColor(data.partner.defaultBrandColors?.primary || '#3B82F6');
        setSecondaryColor(data.partner.defaultBrandColors?.secondary || '#3B82F6');
        setIsLoading(false);
      } catch (err: any) {
        console.error('Fetch partner error:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchPartner();
  }, [partnerId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    
    // Build request body from form data
    const data: any = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      contactEmail: formData.get('contactEmail') as string,
      contactName: formData.get('contactName') as string,
      isActive: formData.get('isActive') === 'on',
    };

    // Default brand colors (v2.8.0)
    if (primaryColor || secondaryColor) {
      data.defaultBrandColors = {
        primary: primaryColor || undefined,
        secondary: secondaryColor || undefined,
      };
    }

    try {
      const response = await fetch(`/api/partners/${partnerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update partner');
      }

      // Navigate back to partner detail page on success
      router.push(`/admin/partners/${partnerId}`);
      router.refresh();
    } catch (err: any) {
      console.error('Update partner error:', err);
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600 dark:text-gray-400">Loading partner...</p>
        </div>
      </div>
    );
  }

  if (error && !partner) {
    return (
      <div className="p-8">
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
        <Link
          href="/admin/partners"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
        >
          ← Back to Partners
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
        <Link href="/admin/partners" className="hover:text-gray-700 dark:hover:text-gray-200">
          Partners
        </Link>
        <span>→</span>
        <Link href={`/admin/partners/${partnerId}`} className="hover:text-gray-700 dark:hover:text-gray-200">
          {partner?.name}
        </Link>
        <span>→</span>
        <span>Edit</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Partner</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Update partner information</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Basic Information</h2>
          
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Partner Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={partner?.name}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., AC Milan, Red Bull, Nike"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              The name of the partner organization or brand
            </p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={partner?.description || ''}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Optional description..."
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Contact Information</h2>
          
          <div>
            <label htmlFor="contactName" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Contact Person
            </label>
            <input
              type="text"
              id="contactName"
              name="contactName"
              defaultValue={partner?.contactName || ''}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., John Doe"
            />
          </div>

          <div>
            <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Contact Email
            </label>
            <input
              type="email"
              id="contactEmail"
              name="contactEmail"
              defaultValue={partner?.contactEmail || ''}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., contact@partner.com"
            />
          </div>
        </div>

        {/* Default Styles for Child Events (v2.8.0) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Default Styles for Events</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Set default brand colors that will automatically apply to all new events under this partner.
              Events can override these later to become independent.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Default Primary Color */}
            <div>
              <label htmlFor="defaultPrimaryColor" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Default Primary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="defaultPrimaryColor"
                  name="defaultPrimaryColor"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-16 h-12 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="#3B82F6"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used for buttons, focus states
              </p>
            </div>

            {/* Default Secondary Color */}
            <div>
              <label htmlFor="defaultSecondaryColor" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Default Border/Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="defaultSecondaryColor"
                  name="defaultSecondaryColor"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-16 h-12 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="#3B82F6"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used for borders, inputs, checkboxes
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              💡 <strong>Note:</strong> Changes to default styles will automatically update all child events that haven't been customized (marked with 🟢).
              Events with custom styles (marked with 🔴) will keep their own values.
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              defaultChecked={partner?.isActive}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-900 dark:text-white">
              Partner is active (visible and usable)
            </label>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Inactive partners won't be available for event creation
          </p>
        </div>

        {/* Partner ID Display */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Partner ID (Read-only)
            </label>
            <code className="block px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white font-mono">
              {partner?.partnerId}
            </code>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This ID is used to reference the partner across the system
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
          <Link
            href={`/admin/partners/${partnerId}`}
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
