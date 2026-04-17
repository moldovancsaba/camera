/**
 * Edit Event Page
 * 
 * Form to edit event details and manage custom page flows
 * v2.0.0: Added custom pages management with reordering
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type CustomPage } from '@/lib/db/schemas';
import CustomPagesManager from '@/components/admin/CustomPagesManager';
import { defaultGoShortOrigin } from '@/lib/site-hosts';

export default function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  
  // v2.0.0: Custom pages state
  const [customPages, setCustomPages] = useState<CustomPage[]>([]);

  // Unwrap params
  useEffect(() => {
    params.then(p => setEventId(p.id));
  }, [params]);

  // Fetch event data on mount
  useEffect(() => {
    if (!eventId) return;

    const fetchEvent = async () => {
      try {
        console.log('Edit page - Fetching event:', eventId);
        const response = await fetch(`/api/events/${eventId}`);
        console.log('Edit page - Response status:', response.status);
        
        const data = await response.json();
        console.log('Edit page - Response data:', data);

        if (!response.ok) {
          console.error('Edit page - Response not OK:', data);
          throw new Error(data.error || 'Failed to load event');
        }

        // apiSuccess wraps in { success: true, data: { event: {...} } }
        const eventData = data.data?.event || data.event;  // Support both structures
        console.log('Edit page - Loaded event data:', eventData);
        setEvent(eventData);
        // v2.0.0: Load custom pages
        setCustomPages(eventData?.customPages || []);
        // Set existing logo preview if available
        if (eventData?.logoUrl) {
          setLogoPreview(eventData.logoUrl);
        }
        setIsLoading(false);
      } catch (err: any) {
        console.error('Fetch event error:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchEvent();
  }, [eventId]);

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
    setLogoPreview(event?.logoUrl || null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    
    // Upload logo if a new file is provided (via server-side API route)
    let logoUrl: string | undefined = event?.logoUrl; // Keep existing logo by default
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
    // v2.0.0: customPages are saved separately via CustomPagesManager
    const data = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      eventDate: formData.get('eventDate') as string,
      location: formData.get('location') as string,
      loadingText: formData.get('loadingText') as string,
      isActive: formData.get('isActive') === 'on',
      logoUrl: logoUrl,
      showLogo: formData.get('showLogo') === 'on',
      brandColor: formData.get('brandColor') as string || undefined,
      brandBorderColor: formData.get('brandBorderColor') as string || undefined,
      shortUrlSlug: (formData.get('shortUrlSlug') as string) ?? '',
    };

    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update event');
      }

      // Navigate back to event detail page on success
      router.push(`/admin/events/${eventId}`);
      router.refresh();
    } catch (err: any) {
      console.error('Update event error:', err);
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600 dark:text-gray-400">Loading event...</p>
        </div>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="p-8">
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
        <Link
          href="/admin/events"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
        >
          ← Back to Events
        </Link>
      </div>
    );
  }

  console.log('Edit page - Rendering with event:', event);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
        <Link href="/admin/events" className="hover:text-gray-700 dark:hover:text-gray-200">
          Events
        </Link>
        <span>→</span>
        <Link href={`/admin/events/${eventId}`} className="hover:text-gray-700 dark:hover:text-gray-200">
          {event?.name}
        </Link>
        <span>→</span>
        <span>Edit</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Event</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Update event information</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Partner Display (Read-only) */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Partner (Read-only)
            </label>
            <div className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white">
              {event?.partnerName}
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Partner cannot be changed after event creation
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
              defaultValue={event?.name}
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
              defaultValue={event?.description || ''}
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
                defaultValue={event?.eventDate ? event.eventDate.split('T')[0] : ''}
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
                defaultValue={event?.location || ''}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., San Siro, Milan"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="shortUrlSlug"
              className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
            >
              Short link slug (optional)
            </label>
            <input
              type="text"
              id="shortUrlSlug"
              name="shortUrlSlug"
              defaultValue={event?.shortUrlSlug || ''}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. selfie"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Lowercase letters, digits, and hyphens (2–63 chars). Leave empty to remove. When set,{' '}
              <span className="font-mono">{defaultGoShortOrigin()}/your-slug</span> redirects to this event’s
              capture page. Hostnames: set <span className="font-mono">GO_SHORT_HOSTNAMES</span> (default includes
              go.messmass.com).
            </p>
          </div>
        </div>

        {/* Customization */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Customization</h2>
          
          <div>
            <label htmlFor="loadingText" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Loading Text
            </label>
            <input
              type="text"
              id="loadingText"
              name="loadingText"
              defaultValue={event?.loadingText || 'Loading event...'}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Loading event..."
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Text shown while the event is loading
            </p>
          </div>

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
              defaultChecked={event?.showLogo}
              disabled={!logoPreview}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
            />
            <label htmlFor="showLogo" className="ml-2 text-sm text-gray-900 dark:text-white">
              Display logo on event pages
            </label>
          </div>
          
          {/* Brand Colors */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Brand Colors</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              These colors will be used throughout the event experience: buttons, inputs, checkboxes, and camera interface
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="brandColor" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Primary Color
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    id="brandColorPicker"
                    defaultValue={event?.brandColor || '#3B82F6'}
                    className="h-10 w-16 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    onChange={(e) => {
                      const textInput = document.getElementById('brandColor') as HTMLInputElement;
                      if (textInput) {
                        textInput.value = e.target.value;
                      }
                    }}
                  />
                  <input
                    type="text"
                    id="brandColor"
                    name="brandColor"
                    defaultValue={event?.brandColor || '#3B82F6'}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    placeholder="#3B82F6"
                    onChange={(e) => {
                      const colorInput = document.getElementById('brandColorPicker') as HTMLInputElement;
                      if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                        colorInput.value = e.target.value;
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Used for buttons, camera capture button fill, and focus states
                </p>
              </div>
              
              <div>
                <label htmlFor="brandBorderColor" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Border/Accent Color
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    id="brandBorderColorPicker"
                    defaultValue={event?.brandBorderColor || '#3B82F6'}
                    className="h-10 w-16 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    onChange={(e) => {
                      const textInput = document.getElementById('brandBorderColor') as HTMLInputElement;
                      if (textInput) {
                        textInput.value = e.target.value;
                      }
                    }}
                  />
                  <input
                    type="text"
                    id="brandBorderColor"
                    name="brandBorderColor"
                    defaultValue={event?.brandBorderColor || '#3B82F6'}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    placeholder="#3B82F6"
                    onChange={(e) => {
                      const colorInput = document.getElementById('brandBorderColorPicker') as HTMLInputElement;
                      if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                        colorInput.value = e.target.value;
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Used for input borders, checkboxes, and camera capture button border
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              defaultChecked={event?.isActive}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-900 dark:text-white">
              Event is active (visible and usable)
            </label>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Inactive events won't be available for frame selection
          </p>
        </div>

        {/* Event ID Display */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Event ID (Read-only)
            </label>
            <code className="block px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white font-mono">
              {event?.eventId}
            </code>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This ID is used to reference the event across the system
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isSubmitting || isUploadingLogo}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploadingLogo ? 'Uploading logo...' : isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
          <Link
            href={`/admin/events/${eventId}`}
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* v2.0.0: Custom Pages Management - Outside form to have independent save */}
      {/* Force re-render when pages change by using length as key */}
      <CustomPagesManager
        key={customPages.length}
        eventId={eventId}
        initialPages={customPages}
        onSave={async (pages) => {
          try {
            const response = await fetch(`/api/events/${eventId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customPages: pages }),
            });
            
            if (!response.ok) {
              let message = 'Failed to save pages';
              try {
                const result = await response.json();
                message = result.error || message;
              } catch {
                message = `Save failed (HTTP ${response.status})`;
              }
              throw new Error(message);
            }
            
            // Reload event data to get updated customPages from server
            const updatedEventResponse = await fetch(`/api/events/${eventId}`);
            const updatedEventData = await updatedEventResponse.json();
            if (updatedEventResponse.ok) {
              const eventData = updatedEventData.data?.event || updatedEventData.event;
              setCustomPages(eventData?.customPages || []);
              setEvent(eventData);
            }
            
            alert('Pages saved successfully!');
          } catch (err: any) {
            throw new Error(err.message);
          }
        }}
      />
    </div>
  );
}
