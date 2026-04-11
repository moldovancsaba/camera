/**
 * Accept Page Component
 * 
 * Displays consent/terms acceptance page with required checkbox
 * Part of the custom event page flow system
 * 
 * Why this component:
 * - GDPR compliance - tracks user consent with timestamp
 * - Required checkbox prevents progression without acceptance
 * - Immutable record of what user agreed to
 */

'use client';

import { useState } from 'react';

export interface AcceptPageConfig {
  title: string;
  description: string;
  checkboxText: string;
  buttonText: string;
}

export interface AcceptPageData {
  accepted: boolean;
  acceptedAt: string;
}

export interface AcceptPageProps {
  config: AcceptPageConfig;
  pageId: string;
  onNext: (data: AcceptPageData) => void;
  onBack?: () => void;
  logoUrl?: string | null;
  brandColor?: string;
  brandBorderColor?: string;
}

/**
 * AcceptPage Component
 * 
 * Renders a consent form with required checkbox
 * User must check the box to proceed
 */
export default function AcceptPage({ config, pageId, onNext, onBack, logoUrl, brandColor = '#3B82F6', brandBorderColor = '#3B82F6' }: AcceptPageProps) {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle next button click
   * Validates checkbox is checked before proceeding
   */
  const handleNext = () => {
    if (!accepted) {
      setError('You must accept to continue');
      return;
    }

    onNext({
      accepted: true,
      acceptedAt: new Date().toISOString(),
    });
  };

  /**
   * Handle checkbox change
   * Clears error when user checks the box
   */
  const handleCheckboxChange = (checked: boolean) => {
    setAccepted(checked);
    if (checked && error) {
      setError(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
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

          {/* Consent Checkbox */}
          <div className="mb-6">
            <label 
              htmlFor={`accept-${pageId}`}
              style={{
                ...(!error && (accepted ? { borderColor: brandBorderColor, backgroundColor: `${brandColor}10` } : { borderColor: '#d1d5db' })),
              }}
              className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                error
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : ''
              }`}
            >
              <input
                id={`accept-${pageId}`}
                type="checkbox"
                checked={accepted}
                onChange={(e) => handleCheckboxChange(e.target.checked)}
                style={{ accentColor: brandColor }}
                className="mt-1 w-5 h-5 border-gray-300 rounded focus:ring-2 flex-shrink-0"
                aria-label="Accept terms"
                aria-invalid={!!error}
                aria-describedby={error ? 'accept-error' : undefined}
              />
              <span className="text-sm text-gray-900 dark:text-white leading-relaxed">
                {config.checkboxText}
              </span>
            </label>
            {error && (
              <p id="accept-error" className="mt-2 text-sm text-red-600 dark:text-red-400 text-center">
                {error}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                aria-label="Go back to previous page"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!accepted}
              style={accepted ? { backgroundColor: brandColor } : {}}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                onBack ? 'flex-1' : 'w-full'
              } ${
                accepted
                  ? 'text-white hover:opacity-90'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
              aria-label={config.buttonText}
              aria-disabled={!accepted}
            >
              {config.buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
