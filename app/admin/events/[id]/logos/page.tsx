/**
 * Event Logos Management Page
 * 
 * Manage logo assignments for event scenarios
 * Organized by 4 scenarios with random selection support
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

interface Logo {
  logoId: string;
  name: string;
  imageUrl: string;
  thumbnailUrl: string;
  isActive: boolean;
}

interface LogoAssignment {
  logoId: string;
  scenario: string;
  order: number;
  isActive: boolean;
  addedAt: string;
  name: string;
  imageUrl: string;
  thumbnailUrl: string;
}

const SCENARIOS = [
  { id: 'slideshow-transition', name: 'Slideshow Transition', description: 'Logo shown during slide transitions with fade in/out' },
  { id: 'onboarding-thankyou', name: 'Onboarding/Thank You Pages', description: 'Logo displayed at top center on custom pages' },
  { id: 'loading-slideshow', name: 'Loading Slideshow', description: 'Logo shown while slideshow is loading' },
  { id: 'loading-capture', name: 'Loading Capture App', description: 'Logo shown while capture app is loading' },
];

export default function EventLogosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string>('');
  const [event, setEvent] = useState<any>(null);
  const [availableLogos, setAvailableLogos] = useState<Logo[]>([]);
  const [assignedLogos, setAssignedLogos] = useState<Record<string, LogoAssignment[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Unwrap params
  useEffect(() => {
    params.then(p => setEventId(p.id));
  }, [params]);

  // Fetch event and logos data
  useEffect(() => {
    if (!eventId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch event details with assigned logos
        const eventResponse = await fetch(`/api/events/${eventId}/logos`);
        const eventData = await eventResponse.json();
        
        console.log('Initial event fetch response:', eventData);
        
        if (!eventResponse.ok) {
          throw new Error(eventData.error || 'Failed to load event');
        }
        
        setEvent({ _id: eventData.eventId, name: eventData.eventName });
        
        // Handle both wrapped and unwrapped responses
        const initialLogosData = eventData.logos || eventData.data?.logos || {};
        console.log('Initial assigned logos:', initialLogosData);
        setAssignedLogos(initialLogosData);

        // Fetch all available logos
        const logosResponse = await fetch('/api/logos?active=true&limit=100');
        const logosData = await logosResponse.json();
        
        if (!logosResponse.ok) {
          throw new Error(logosData.error || 'Failed to load logos');
        }
        
        console.log('Logos API response:', logosData);
        // API returns { success: true, data: { logos, pagination } }
        const availableLogosData = logosData.logos || logosData.data?.logos || [];
        console.log('Available logos:', availableLogosData);
        setAvailableLogos(availableLogosData);
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [eventId]);

  const handleAssignLogo = async (logoId: string, scenario: string) => {
    try {
      console.log('Assigning logo:', logoId, 'to scenario:', scenario);
      const response = await fetch(`/api/events/${eventId}/logos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoId, scenario, isActive: true }),
      });

      console.log('Assignment response status:', response.status);
      const data = await response.json();
      console.log('Assignment response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign logo');
      }

      alert('Logo assigned successfully!');

      // Refresh data
      console.log('Refreshing assigned logos...');
      const eventResponse = await fetch(`/api/events/${eventId}/logos`);
      console.log('Refresh response status:', eventResponse.status);
      const eventData = await eventResponse.json();
      console.log('Refresh response data:', eventData);
      
      // Handle both wrapped and unwrapped responses
      const assignedLogosData = eventData.logos || eventData.data?.logos || {};
      console.log('Setting assigned logos:', assignedLogosData);
      setAssignedLogos(assignedLogosData);
    } catch (err: any) {
      console.error('Assignment error:', err);
      alert(err.message);
    }
  };

  const handleRemoveLogo = async (logoId: string) => {
    if (!confirm('Remove this logo from the event?')) return;

    try {
      const response = await fetch(`/api/events/${eventId}/logos/${logoId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove logo');
      }

      // Refresh data
      const eventResponse = await fetch(`/api/events/${eventId}/logos`);
      const eventData = await eventResponse.json();
      setAssignedLogos(eventData.logos || {});
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleLogo = async (logoId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/logos/${logoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle logo');
      }

      // Refresh data
      const eventResponse = await fetch(`/api/events/${eventId}/logos`);
      const eventData = await eventResponse.json();
      setAssignedLogos(eventData.logos || {});
    } catch (err: any) {
      alert(err.message);
    }
  };

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

  if (error || !event) {
    return (
      <div className="p-8">
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error || 'Event not found'}</p>
        </div>
        <Link href="/admin/events" className="text-blue-600 hover:text-blue-800 dark:text-blue-400">
          ← Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
        <Link href="/admin/events" className="hover:text-gray-700 dark:hover:text-gray-200">
          Events
        </Link>
        <span>→</span>
        <Link href={`/admin/events/${eventId}`} className="hover:text-gray-700 dark:hover:text-gray-200">
          {event.name}
        </Link>
        <span>→</span>
        <span>Logos</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Manage Event Logos</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Assign logos to scenarios for <strong>{event.name}</strong>
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
          💡 Multiple active logos per scenario = random selection on each display
        </p>
      </div>

      <div className="space-y-8">
        {SCENARIOS.map((scenario) => {
          const scenarioLogos = assignedLogos[scenario.id] || [];
          const assignedLogoIds = scenarioLogos.map((l: LogoAssignment) => l.logoId);
          const unassignedLogos = availableLogos.filter((l: Logo) => !assignedLogoIds.includes(l.logoId));

          return (
            <div key={scenario.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {scenario.name}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {scenario.description}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Assigned Logos */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Assigned ({scenarioLogos.length})
                  </h3>
                  {scenarioLogos.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      No logos assigned
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scenarioLogos.map((logo: LogoAssignment) => (
                        <div
                          key={logo.logoId}
                          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                        >
                          <div className="relative w-12 h-12 flex-shrink-0">
                            <Image
                              src={logo.thumbnailUrl}
                              alt={logo.name}
                              fill
                              className="object-contain rounded"
                              unoptimized
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {logo.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleLogo(logo.logoId)}
                              className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                logo.isActive
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                              }`}
                            >
                              {logo.isActive ? '● Active' : '○ Inactive'}
                            </button>
                            <button
                              onClick={() => handleRemoveLogo(logo.logoId)}
                              className="text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Available Logos */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Available ({unassignedLogos.length})
                  </h3>
                  {unassignedLogos.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      All logos are assigned
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {unassignedLogos.map((logo: Logo) => (
                        <div
                          key={logo.logoId}
                          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <div className="relative w-12 h-12 flex-shrink-0">
                            <Image
                              src={logo.thumbnailUrl}
                              alt={logo.name}
                              fill
                              className="object-contain rounded"
                              unoptimized
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {logo.name}
                            </p>
                          </div>
                          <button
                            onClick={() => handleAssignLogo(logo.logoId, scenario.id)}
                            className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Assign
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <Link
          href={`/admin/events/${eventId}`}
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
        >
          ← Back to Event
        </Link>
      </div>
    </div>
  );
}
