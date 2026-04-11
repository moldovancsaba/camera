/**
 * CTA (Call To Action) Page Component
 * 
 * Displays call-to-action page that can redirect to a URL
 * Part of the custom event page flow system
 * 
 * CTA behavior (custom page flow):
 * - checkboxText repurposed as URL to visit
 * - Button is optional (hasButton config)
 * - If hasButton=false, this becomes an end page that auto-redirects
 * 
 * Why separate from AcceptPage:
 * - Semantic difference: CTA is for marketing/engagement, Accept is for legal consent
 * - Different analytics tracking (acceptance rates for CTAs vs consents)
 * - May have different styling/prominence in future
 */

'use client';

import { useState } from 'react';

export interface CTAPageConfig {
  title: string;
  description: string;
  checkboxText: string;  // Repurposed as URL to visit
  buttonText: string;
  hasButton?: boolean;   // If false, this is an end page (no button, auto-redirect)
  visitButtonText?: string;  // Label for visit URL button
  redirectingText?: string;  // Text shown while redirecting
}

export interface CTAPageData {
  accepted: boolean;
  acceptedAt: string;
}

export interface CTAPageProps {
  config: CTAPageConfig;
  pageId: string;
  onNext: (data: CTAPageData) => void;
  onBack?: () => void;
  logoUrl?: string | null;
  brandColor?: string;
  brandBorderColor?: string;
}

/**
 * CTAPage Component
 * 
 * Renders a call-to-action page that redirects to a URL
 * If hasButton is true, shows continue button
 * If hasButton is false, auto-redirects after displaying message
 */
export default function CTAPage({ config, pageId, onNext, onBack, logoUrl, brandColor = '#9333EA', brandBorderColor = '#9333EA' }: CTAPageProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasButton = config.hasButton !== false;  // Default to true for backward compatibility
  const urlToVisit = config.checkboxText;  // Repurposed field
  const visitButtonText = config.visitButtonText || 'Visit Now';
  const redirectingText = config.redirectingText || 'Redirecting you shortly...';

  /**
   * Handle redirect to URL
   * Opens URL in new tab if hasButton, or same window if no button (end page)
   */
  const handleRedirect = () => {
    if (urlToVisit) {
      if (hasButton) {
        // Open URL in new tab when there's a continue button
        setIsRedirecting(true);
        window.open(urlToVisit, '_blank');
      } else {
        // Open URL in same window when no continue button (end page)
        window.location.href = urlToVisit;
      }
    } else if (hasButton) {
      // No URL, just continue
      onNext({
        accepted: true,
        acceptedAt: new Date().toISOString(),
      });
    }
  };

  /**
   * Handle continue button click (when hasButton=true)
   */
  const handleContinue = () => {
    onNext({
      accepted: true,
      acceptedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 sm:p-8">
          {/* Logo */}
          {logoUrl && (
            <div className="flex justify-center mb-6">
              <img
                src={logoUrl}
                alt="Event logo"
                className="max-w-xs max-h-32 object-contain"
              />
            </div>
          )}
          
          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 text-center">
            {config.title}
          </h1>

          {/* Description */}
          {config.description && (
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">
              {config.description}
            </p>
          )}

          {/* Visit URL Button (if URL provided) */}
          {urlToVisit && (
            <div className="mb-6">
              <button
                onClick={handleRedirect}
                disabled={isRedirecting}
                style={{ backgroundColor: brandColor }}
                className="w-full px-6 py-4 text-white rounded-lg font-semibold text-lg hover:opacity-90 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                aria-label="Visit URL"
              >
                {isRedirecting ? `🔗 Opening...` : `🔗 ${visitButtonText}`}
              </button>
              {hasButton && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                  Opens in a new tab
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {onBack && hasButton && (
              <button
                onClick={onBack}
                className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                aria-label="Go back to previous page"
              >
                Back
              </button>
            )}
            {hasButton && (
              <button
                onClick={handleContinue}
                style={{ backgroundColor: brandColor }}
                className={`px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-90 text-white ${
                  onBack ? 'flex-1' : 'w-full'
                }`}
                aria-label={config.buttonText}
              >
                {config.buttonText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
