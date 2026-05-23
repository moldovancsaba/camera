/**
 * Event Frame Management Page
 * 
 * Manage frame assignments for an event
 * - Show currently assigned frames
 * - Add frames from available global and partner frames
 * - Remove frames from event
 * - Toggle frame activation at event level
 */

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface EventFrameAssignment {
  frameId: string;
  isActive: boolean;
}

interface EventRecord {
  name: string;
  frames?: EventFrameAssignment[];
}

interface FrameRecord {
  frameId: string;
  name: string;
  thumbnailUrl?: string;
  hashtags?: string[];
}

interface EventResponse {
  data?: {
    event?: EventRecord;
  };
  event?: EventRecord;
  error?: string;
}

interface FramesResponse {
  data?: {
    frames?: FrameRecord[];
  };
  error?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function EventFramesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [eventId, setEventId] = useState<string>('');
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [availableFrames, setAvailableFrames] = useState<FrameRecord[]>([]);
  const [assignedFrames, setAssignedFrames] = useState<EventFrameAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Unwrap params
  useEffect(() => {
    params.then(p => setEventId(p.id));
  }, [params]);

  // Fetch event and frames data
  useEffect(() => {
    if (!eventId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch event details
        const eventResponse = await fetch(`/api/events/${eventId}`);
        const eventData: EventResponse = await eventResponse.json();
        
        if (!eventResponse.ok) {
          throw new Error(eventData.error || 'Failed to load event');
        }
        
        // apiSuccess wraps in { success: true, data: { event: {...} } }
        const event = eventData.data?.event || eventData.event;
        if (!event) {
          throw new Error('Event not found');
        }
        setEvent(event);
        setAssignedFrames(event?.frames || []);

        // Fetch available frames (all active frames for now)
        // Note: Future enhancement - filter by global + partner-specific frames
        // See ROADMAP.md Q1 2026 - Advanced Frame Features (Frame Categories)
        const framesResponse = await fetch('/api/frames?active=true&limit=100');
        const framesData: FramesResponse = await framesResponse.json();
        
        if (!framesResponse.ok) {
          throw new Error(framesData.error || 'Failed to load frames');
        }
        
        console.log('DEBUG: Available frames from API:', framesData.data?.frames);
        console.log('DEBUG: Assigned frames:', event?.frames);
        
        setAvailableFrames(framesData.data?.frames || []);
        setIsLoading(false);
      } catch (err: unknown) {
        console.error('Error fetching data:', err);
        setError(getErrorMessage(err));
        setIsLoading(false);
      }
    };

    fetchData();
  }, [eventId]);

  const handleAssignFrame = async (frameMongoId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameId: frameMongoId, isActive: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to assign frame');
      }

      // Refresh data
      const eventResponse = await fetch(`/api/events/${eventId}`);
      const eventData: EventResponse = await eventResponse.json();
      const event = eventData.data?.event || eventData.event;
      if (!event) {
        throw new Error('Event not found');
      }
      setEvent(event);
      setAssignedFrames(event?.frames || []);
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  };

  const handleRemoveFrame = async (frameId: string) => {
    if (!confirm('Remove this frame from the event?')) return;

    try {
      const response = await fetch(`/api/events/${eventId}/frames/${frameId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove frame');
      }

      // Refresh data
      const eventResponse = await fetch(`/api/events/${eventId}`);
      const eventData: EventResponse = await eventResponse.json();
      const event = eventData.data?.event || eventData.event;
      if (!event) {
        throw new Error('Event not found');
      }
      setEvent(event);
      setAssignedFrames(event?.frames || []);
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  };

  const handleToggleFrame = async (frameId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/frames/${frameId}/toggle`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle frame');
      }

      // Refresh data
      const eventResponse = await fetch(`/api/events/${eventId}`);
      const eventData: EventResponse = await eventResponse.json();
      const event = eventData.data?.event || eventData.event;
      if (!event) {
        throw new Error('Event not found');
      }
      setEvent(event);
      setAssignedFrames(event?.frames || []);
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600 dark:text-gray-400">Loading frames...</p>
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

  const assignedFrameIds = assignedFrames.map((frame) => frame.frameId);
  console.log('DEBUG: Assigned frame IDs:', assignedFrameIds);
  console.log('DEBUG: Available frames:', availableFrames.map((frame) => ({ frameId: frame.frameId, name: frame.name })));
  const unassignedFrames = availableFrames.filter((frame) => !assignedFrameIds.includes(frame.frameId));
  console.log('DEBUG: Unassigned frames:', unassignedFrames.map((frame) => ({ frameId: frame.frameId, name: frame.name })));

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
        <span>Frames</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Manage Event Frames</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Assign and manage frames for <strong>{event.name}</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assigned Frames */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Assigned Frames ({assignedFrames.length})
            </h2>
          </div>
          <div className="p-6">
            {assignedFrames.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No frames assigned yet
              </div>
            ) : (
              <div className="space-y-3">
                {assignedFrames.map((frameAssignment) => {
                  const frame = availableFrames.find((availableFrame) => availableFrame.frameId === frameAssignment.frameId);
                  return (
                    <div
                      key={frameAssignment.frameId}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {frame?.thumbnailUrl ? (
                          <Image
                            src={frame.thumbnailUrl} 
                            alt={frame.name}
                            width={64}
                            height={64}
                            unoptimized
                            className="w-16 h-auto object-contain"
                          />
                        ) : (
                          <div className="text-2xl">🖼️</div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {frame?.name || frameAssignment.frameId}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {frameAssignment.frameId}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleFrame(frameAssignment.frameId)}
                          className={`px-3 py-1 text-xs font-semibold rounded-full ${
                            frameAssignment.isActive
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                          }`}
                        >
                          {frameAssignment.isActive ? '● Active' : '○ Inactive'}
                        </button>
                        <button
                          onClick={() => handleRemoveFrame(frameAssignment.frameId)}
                          className="px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Available Frames */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Available Frames ({unassignedFrames.length})
            </h2>
          </div>
          <div className="p-6">
            {unassignedFrames.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                All frames are assigned
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {unassignedFrames.map((frame) => (
                  <div
                    key={frame.frameId}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {frame.thumbnailUrl ? (
                        <Image
                          src={frame.thumbnailUrl} 
                          alt={frame.name}
                          width={64}
                          height={64}
                          unoptimized
                          className="w-16 h-auto object-contain"
                        />
                      ) : (
                        <div className="text-2xl">🖼️</div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {frame.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {frame.hashtags?.join(', ') || 'No hashtags'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAssignFrame(frame.frameId)}
                      className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
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
