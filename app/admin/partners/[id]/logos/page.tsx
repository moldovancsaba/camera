/**
 * Partner Default Logos Management Page
 * 
 * Manage default logo assignments for a partner
 * These defaults cascade to all child events
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PartnerLogosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState<string>('');
  const [partner, setPartner] = useState<any>(null);
  const [availableLogos, setAvailableLogos] = useState<any[]>([]);
  const [defaultLogos, setDefaultLogos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(p => setPartnerId(p.id));
  }, [params]);

  useEffect(() => {
    if (!partnerId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        const partnerResponse = await fetch(`/api/partners/${partnerId}`);
        const partnerData = await partnerResponse.json();
        
        if (!partnerResponse.ok) {
          throw new Error(partnerData.error || 'Failed to load partner');
        }
        
        const partner = partnerData.partner;
        setPartner(partner);
        setDefaultLogos(partner.defaultLogos || []);

        const logosResponse = await fetch('/api/logos?active=true&limit=100');
        const logosData = await logosResponse.json();
        
        if (!logosResponse.ok) {
          throw new Error(logosData.error || 'Failed to load logos');
        }
        
        setAvailableLogos(logosData.data?.logos || []);
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [partnerId]);

  const handleToggleLogo = (logoId: string, scenario: string) => {
    setDefaultLogos(prev => {
      const exists = prev.find((l: any) => l.logoId === logoId && l.scenario === scenario);
      if (exists) {
        return prev.filter((l: any) => !(l.logoId === logoId && l.scenario === scenario));
      } else {
        return [...prev, { logoId, scenario, order: prev.length }];
      }
    });
  };

  const isLogoSelected = (logoId: string, scenario: string) => {
    return defaultLogos.some((l: any) => l.logoId === logoId && l.scenario === scenario);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/partners/${partnerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultLogos }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      router.push(`/admin/partners/${partnerId}`);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="p-8">
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error || 'Partner not found'}</p>
        </div>
        <Link href="/admin/partners" className="text-blue-600 hover:text-blue-800 dark:text-blue-400">
          ← Back to Partners
        </Link>
      </div>
    );
  }

  const scenarios = [
    { id: 'slideshow-transition', name: 'Slideshow Transitions', icon: '🔄' },
    { id: 'onboarding-thankyou', name: 'Custom Pages', icon: '📝' },
    { id: 'loading-slideshow', name: 'Loading Slideshow', icon: '⏳' },
    { id: 'loading-capture', name: 'Loading Capture', icon: '📸' },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
        <Link href="/admin/partners" className="hover:text-gray-700 dark:hover:text-gray-200">
          Partners
        </Link>
        <span>→</span>
        <Link href={`/admin/partners/${partnerId}`} className="hover:text-gray-700 dark:hover:text-gray-200">
          {partner.name}
        </Link>
        <span>→</span>
        <span>Default Logos</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Manage Default Logos</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Select logos by scenario that will be automatically assigned to new events under {partner.name}
        </p>
      </div>

      <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-blue-800 dark:text-blue-200 text-sm">
          💡 <strong>Note:</strong> Changes will automatically cascade to all child events marked with 🟢. 
          Events with custom logos (🔴) will keep their selections.
        </p>
      </div>

      {availableLogos.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-4">🎨</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No logos available</h3>
          <p className="text-gray-600 dark:text-gray-400">Create logos first to assign them as defaults</p>
        </div>
      ) : (
        <div className="space-y-6">
          {scenarios.map((scenario) => (
            <div key={scenario.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>{scenario.icon}</span>
                  <span>{scenario.name}</span>
                  <span className="text-sm font-normal text-gray-500">
                    ({defaultLogos.filter((l: any) => l.scenario === scenario.id).length} selected)
                  </span>
                </h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {availableLogos.map((logo: any) => {
                    const isSelected = isLogoSelected(logo.logoId, scenario.id);
                    
                    return (
                      <button
                        key={`${logo.logoId}-${scenario.id}`}
                        onClick={() => handleToggleLogo(logo.logoId, scenario.id)}
                        className={`relative p-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs">
                            ✓
                          </div>
                        )}
                        <div className="text-center">
                          {logo.thumbnailUrl ? (
                            <img 
                              src={logo.thumbnailUrl} 
                              alt={logo.name}
                              className="w-full h-16 object-contain mb-1"
                            />
                          ) : (
                            <div className="text-2xl mb-1">🎨</div>
                          )}
                          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {logo.name}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : `Save Defaults (${defaultLogos.length} selected)`}
        </button>
        <Link
          href={`/admin/partners/${partnerId}`}
          className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
