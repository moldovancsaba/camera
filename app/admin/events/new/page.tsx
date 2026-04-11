/**
 * Add New Event Page
 * 
 * Form to create a new event with partner selection
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PartnerSearchDropdown from '@/components/admin/PartnerSearchDropdown';

export default function NewEventPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPartnerId = searchParams.get('partnerId');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPartners, setIsLoadingPartners] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(preselectedPartnerId);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Fetch partners on mount
  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const response = await fetch('/api/partners?active=true&limit=100');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load partners');
        }

        // API returns { success: true, data: { partners: [...] } }
        const partnersList = data.data?.partners || data.partners || [];
        console.log('Loaded partners:', partnersList.length);
        setPartners(partnersList);
        setIsLoadingPartners(false);
      } catch (err: any) {
        console.error('Fetch partners error:', err);
        setError(err.message);
        setIsLoadingPartners(false);
      }
    };

    fetchPartners();
  }, []);

  // Handle logo file selection
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onload = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Clear logo
  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    
    // Upload logo if provided (via server-side API route)
    let logoUrl: string | undefined;
    if (logoFile) {
      try {
        setIsUploadingLogo(true);
        // Convert file to base64
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(logoFile);
        });
        
        // Upload via API route (server-side has access to IMGBB_API_KEY)
        const uploadResponse = await fetch('/api/upload-logo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            imageData: base64Data,
            name: `event-logo-${Date.now()}`
          }),
        });
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(uploadResult.error || 'Upload failed');
        }
        
        logoUrl = uploadResult.imageUrl;
      } catch (err: any) {
        console.error('Logo upload error:', err);
        setError(`Failed to upload logo: ${err.message}`);
        setIsSubmitting(false);
        setIsUploadingLogo(false);
        return;
      } finally {
        setIsUploadingLogo(false);
      }
    }
    
    // Build request body from form data
    const data = {
      name: formData.get('name') as string,
      partnerId: formData.get('partnerId') as string,
      description: formData.get('description') as string,
      eventDate: formData.get('eventDate') as string,
      location: formData.get('location') as string,
      isActive: formData.get('isActive') === 'on',
      logoUrl: logoUrl,
      showLogo: formData.get('showLogo') === 'on',
    };

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create event');
      }

      // Navigate to event detail page on success
      // API returns { success: true, data: { event: {...} } }
      const event = result.data?.event || result.event;
      if (!event || !event._id) {
        throw new Error('Invalid response from server');
      }
      router.push(`/admin/events/${event._id}`);
      router.refresh();
    } catch (err: any) {
      console.error('Create event error:', err);
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Add New Event</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Create a new event for a partner</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Partner Selection */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Partner</h2>
          
          <div>
            <label htmlFor="partnerId" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Select Partner *
            </label>
            {isLoadingPartners ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading partners...</div>
            ) : partners.length === 0 ? (
              <div className="text-sm text-red-600 dark:text-red-400">
                No active partners found. Please create a partner first.
              </div>
            ) : (
              <PartnerSearchDropdown
                partners={partners}
                selectedPartnerId={selectedPartnerId}
                onSelect={(partnerId) => setSelectedPartnerId(partnerId)}
                required
              />
            )}
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              The partner organization for this event
            </p>
          </div>
        </div>

        {/* Event Details */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Event Details</h2>
          
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Event Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Serie A - AC Milan x AS Roma"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Optional event description..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="eventDate" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Event Date
              </label>
              <input
                type="date"
                id="eventDate"
                name="eventDate"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., San Siro, Milan"
              />
            </div>
          </div>
        </div>

        {/* Customization */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Customization</h2>
          
          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Event Logo
            </label>
            {logoPreview ? (
              <div className="relative inline-block">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="h-24 w-auto rounded border border-gray-300 dark:border-gray-600"
                />
                <button
                  type="button"
                  onClick={clearLogo}
                  className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  id="logo"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleLogoChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Upload a logo to display during loading and on capture pages (JPEG, PNG, WebP, max 32MB)
            </p>
          </div>

          {/* Show Logo Checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="showLogo"
              name="showLogo"
              disabled={!logoFile && !logoPreview}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
            />
            <label htmlFor="showLogo" className="ml-2 text-sm text-gray-900 dark:text-white">
              Display logo on event pages
            </label>
          </div>
        </div>

        {/* Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              defaultChecked
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-900 dark:text-white">
              Make event active (visible and usable)
            </label>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Inactive events won't be available for frame selection
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isSubmitting || isUploadingLogo || partners.length === 0}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploadingLogo ? 'Uploading logo...' : isSubmitting ? 'Creating...' : 'Create Event'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
