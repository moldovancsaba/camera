/**
 * Partner Default Frames Management Page
 * 
 * Manage default frame assignments for a partner
 * These defaults cascade to all child events
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PartnerFramesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState<string>('');
  const [partner, setPartner] = useState<any>(null);
  const [availableFrames, setAvailableFrames] = useState<any[]>([]);
  const [defaultFrames, setDefaultFrames] = useState<string[]>([]);
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
        setDefaultFrames(partner.defaultFrames || []);

        const framesResponse = await fetch('/api/frames?active=true&limit=100');
        const framesData = await framesResponse.json();
        
        if (!framesResponse.ok) {
          throw new Error(framesData.error || 'Failed to load frames');
        }
        
        setAvailableFrames(framesData.data?.frames || []);
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [partnerId]);

  const handleToggleFrame = (frameId: string) => {
    setDefaultFrames(prev => 
      prev.includes(frameId)
        ? prev.filter(id => id !== frameId)
        : [...prev, frameId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/partners/${partnerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultFrames }),
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
        <span>Default Frames</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Manage Default Frames</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Select frames that will be automatically assigned to new events under {partner.name}
        </p>
      </div>

      <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-blue-800 dark:text-blue-200 text-sm">
          💡 <strong>Note:</strong> Changes will automatically cascade to all child events marked with 🟢. 
          Events with custom frames (🔴) will keep their selections.
        </p>
      </div>

      {availableFrames.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-4">🖼️</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No frames available</h3>
          <p className="text-gray-600 dark:text-gray-400">Create frames first to assign them as defaults</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {availableFrames.map((frame: any) => {
              const isSelected = defaultFrames.includes(frame.frameId);
              
              return (
                <button
                  key={frame.frameId}
                  onClick={() => handleToggleFrame(frame.frameId)}
                  className={`relative p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs">
                      ✓
                    </div>
                  )}
                  <div className="text-center">
                    {frame.thumbnailUrl ? (
                      <img 
                        src={frame.thumbnailUrl} 
                        alt={frame.name}
                        className="w-full h-32 object-contain mb-2"
                      />
                    ) : (
                      <div className="text-4xl mb-2">🖼️</div>
                    )}
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {frame.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : `Save Defaults (${defaultFrames.length} selected)`}
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
