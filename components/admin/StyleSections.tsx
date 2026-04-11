/**
 * Style Sections Component
 * 
 * Unified display component for Brand Colors, Assigned Frames, and Event Logos
 * Used on both partner detail and event detail pages
 */

import Link from 'next/link';
import StyleInheritanceIndicator from './StyleInheritanceIndicator';

interface StyleSectionsProps {
  // Context
  type: 'partner' | 'event';
  id: string;
  name: string;
  
  // Brand Colors
  brandColor?: string;
  brandBorderColor?: string;
  brandColorsOverridden?: boolean;
  
  // Frames
  frames?: any[];
  framesOverridden?: boolean;
  
  // Logos
  logos?: any[];
  logosOverridden?: boolean;
  
  // Partner context (for event pages)
  partnerName?: string;
}

export default function StyleSections({
  type,
  id,
  name,
  brandColor,
  brandBorderColor,
  brandColorsOverridden,
  frames = [],
  framesOverridden,
  logos = [],
  logosOverridden,
  partnerName,
}: StyleSectionsProps) {
  const isPartner = type === 'partner';
  const isEvent = type === 'event';
  
  return (
    <div className="space-y-6">
      {/* Brand Colors Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {isPartner ? 'Default Brand Colors' : 'Brand Colors'}
                </h2>
                {isEvent && partnerName && (
                  <StyleInheritanceIndicator
                    styleField="brandColors"
                    isOverridden={brandColorsOverridden === true}
                    eventId={id}
                    partnerName={partnerName}
                  />
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {isPartner 
                  ? 'Default colors for all child events (can be overridden)'
                  : 'Used throughout the event experience: buttons, inputs, checkboxes, and camera interface'
                }
              </p>
            </div>
            <Link
              href={isPartner ? `/admin/partners/${id}/edit` : `/admin/events/${id}/edit`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Edit Colors
            </Link>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Primary Color
              </label>
              <div className="flex items-center gap-3">
                <div
                  className="w-16 h-16 rounded-lg border-2 border-gray-300 dark:border-gray-600 shadow-sm"
                  style={{ backgroundColor: brandColor || '#3B82F6' }}
                ></div>
                <div>
                  <p className="text-sm font-mono text-gray-900 dark:text-white font-semibold">
                    {brandColor || '#3B82F6'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Buttons, camera button fill, focus states
                  </p>
                </div>
              </div>
            </div>

            {/* Border Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Border/Accent Color
              </label>
              <div className="flex items-center gap-3">
                <div
                  className="w-16 h-16 rounded-lg border-2 border-gray-300 dark:border-gray-600 shadow-sm"
                  style={{ backgroundColor: brandBorderColor || '#3B82F6' }}
                ></div>
                <div>
                  <p className="text-sm font-mono text-gray-900 dark:text-white font-semibold">
                    {brandBorderColor || '#3B82F6'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Input borders, checkboxes, camera button border
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Color Preview</p>
            <div className="flex gap-3">
              <button
                style={{ backgroundColor: brandColor || '#3B82F6' }}
                className="px-6 py-3 text-white rounded-lg font-semibold shadow-sm"
                disabled
              >
                Primary Button
              </button>
              <button
                style={{ borderColor: brandBorderColor || '#3B82F6', color: brandBorderColor || '#3B82F6' }}
                className="px-6 py-3 bg-white dark:bg-gray-800 rounded-lg font-semibold shadow-sm border-2"
                disabled
              >
                Bordered Button
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Assigned Frames Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isPartner ? 'Default Frames' : 'Assigned Frames'}
              </h2>
              {isEvent && partnerName && (
                <StyleInheritanceIndicator
                  styleField="frames"
                  isOverridden={framesOverridden === true}
                  eventId={id}
                  partnerName={partnerName}
                />
              )}
            </div>
            <Link
              href={isPartner ? `/admin/partners/${id}/frames` : `/admin/events/${id}/frames`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Manage Frames
            </Link>
          </div>
        </div>

        {(!frames || frames.length === 0) ? (
          <div className="p-12 text-center">
            <div className="text-5xl mb-4">🖼️</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No frames assigned yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {isPartner 
                ? 'Set default frames that will be assigned to new events'
                : 'Assign frames to this event to make them available for users'
              }
            </p>
            <Link
              href={isPartner ? `/admin/partners/${id}/frames` : `/admin/events/${id}/frames`}
              className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Assign Frames
            </Link>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {frames.map((frameAssignment: any, index: number) => {
                const frameDetails = frameAssignment.frameDetails || frameAssignment;
                const thumbnailUrl = frameDetails.thumbnailUrl;
                const frameName = frameDetails.name || 'Unnamed Frame';
                
                return (
                  <div
                    key={index}
                    className="relative bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="text-center">
                      {thumbnailUrl ? (
                        <div className="mb-2 flex items-center justify-center">
                          <img 
                            src={thumbnailUrl} 
                            alt={frameName}
                            className="max-w-full h-auto max-h-32 object-contain"
                          />
                        </div>
                      ) : (
                        <div className="text-3xl mb-2">🖼️</div>
                      )}
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-1 truncate">
                        {frameName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate mb-2">
                        {frameAssignment.frameId}
                      </p>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        frameAssignment.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {frameAssignment.isActive ? '● Active' : '○ Inactive'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-center">
              <Link
                href={isPartner ? `/admin/partners/${id}/edit#frames` : `/admin/events/${id}/frames`}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
              >
                Manage frame assignments →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Event Logos Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isPartner ? 'Default Logos' : 'Event Logos'}
              </h2>
              {isEvent && partnerName && (
                <StyleInheritanceIndicator
                  styleField="logos"
                  isOverridden={logosOverridden === true}
                  eventId={id}
                  partnerName={partnerName}
                />
              )}
            </div>
            <Link
              href={isPartner ? `/admin/partners/${id}/logos` : `/admin/events/${id}/logos`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Manage Logos
            </Link>
          </div>
        </div>

        {(!logos || logos.length === 0) ? (
          <div className="p-12 text-center">
            <div className="text-5xl mb-4">🎨</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No logos assigned yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {isPartner
                ? 'Set default logos that will be assigned to new events'
                : 'Assign logos to display on different screens (transitions, loading, custom pages)'
              }
            </p>
            <Link
              href={isPartner ? `/admin/partners/${id}/logos` : `/admin/events/${id}/logos`}
              className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Assign Logos
            </Link>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries([
                { id: 'slideshow-transition', name: 'Slideshow Transitions', icon: '🔄' },
                { id: 'onboarding-thankyou', name: 'Custom Pages', icon: '📝' },
                { id: 'loading-slideshow', name: 'Loading Slideshow', icon: '⏳' },
                { id: 'loading-capture', name: 'Loading Capture', icon: '📸' },
              ]).map(([key, scenario]: [string, any]) => {
                const count = (logos || []).filter((l: any) => l.scenario === scenario.id && l.isActive).length;
                return (
                  <div
                    key={scenario.id}
                    className="relative bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="text-center">
                      <div className="text-3xl mb-2">{scenario.icon}</div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        {scenario.name}
                      </p>
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        {count} active
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-center">
              <Link
                href={isPartner ? `/admin/partners/${id}/edit#logos` : `/admin/events/${id}/logos`}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
              >
                Manage logo assignments →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
