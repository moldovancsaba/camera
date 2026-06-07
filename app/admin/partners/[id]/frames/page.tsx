'use client';

/**
 * Partner Default Frames Management Page
 *
 * Manage default frame assignments for a partner.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { InlineAlert, LabelTag, SemanticButton, StateBlock } from '@doneisbetter/gds-core/client';

interface PartnerRecord {
  name: string;
  defaultFrames?: string[];
}

interface FrameRecord {
  frameId: string;
  name: string;
  thumbnailUrl?: string;
}

interface PartnerResponse {
  data?: { partner?: PartnerRecord };
  partner?: PartnerRecord;
  error?: string;
}

interface FramesResponse {
  data?: { frames?: FrameRecord[] };
  error?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function PartnerFramesPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState('');
  const [partner, setPartner] = useState<PartnerRecord | null>(null);
  const [availableFrames, setAvailableFrames] = useState<FrameRecord[]>([]);
  const [defaultFrames, setDefaultFrames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolved) => setPartnerId(resolved.id));
  }, [params]);

  useEffect(() => {
    if (!partnerId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);

        const partnerResponse = await fetch(`/api/partners/${partnerId}`);
        const partnerData: PartnerResponse = await partnerResponse.json();
        if (!partnerResponse.ok) {
          throw new Error(partnerData.error || 'Failed to load partner');
        }

        const partnerRecord = partnerData.data?.partner || partnerData.partner;
        if (!partnerRecord) {
          throw new Error('Partner not found');
        }
        setPartner(partnerRecord);
        setDefaultFrames(partnerRecord.defaultFrames || []);

        const framesResponse = await fetch('/api/frames?active=true&limit=100');
        const framesData: FramesResponse = await framesResponse.json();
        if (!framesResponse.ok) {
          throw new Error(framesData.error || 'Failed to load frames');
        }

        setAvailableFrames(framesData.data?.frames || []);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [partnerId]);

  const handleToggleFrame = (frameId: string) => {
    setDefaultFrames((current) => (current.includes(frameId) ? current.filter((id) => id !== frameId) : [...current, frameId]));
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
    } catch (saveError) {
      alert(getErrorMessage(saveError));
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading..." />;
  }

  if (error || !partner) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <InlineAlert title="Error" message={error || 'Partner not found'} severity="error" />
        <Link href="/admin/partners">← Back to Partners</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href="/admin/partners">Partners</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/partners/${partnerId}`}>{partner.name}</Link>
        <span aria-hidden> / </span>
        <span>Default Frames</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Manage Default Frames"
        description={`Select frames that will be automatically assigned to new events under ${partner.name}`}
      />

      <InlineAlert
        title="Default inheritance"
        message="Changes automatically cascade to child events that still inherit partner defaults. Events with custom frames keep their selections."
        severity="info"
      />

      {availableFrames.length === 0 ? (
        <StateBlock variant="empty" title="No frames available" description="Create frames first to assign them as defaults." />
      ) : (
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
          {availableFrames.map((frame) => {
            const isSelected = defaultFrames.includes(frame.frameId);

            return (
              <button
                key={frame.frameId}
                type="button"
                aria-pressed={isSelected}
                style={{ background: 'var(--gds-color-surface)', border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', cursor: 'pointer', padding: '1rem' }}
                onClick={() => handleToggleFrame(frame.frameId)}
              >
                <span style={{ alignItems: 'center', display: 'grid', gap: '0.75rem', justifyItems: 'center' }}>
                  {isSelected ? <LabelTag tone="success" label="Selected" /> : null}
                  {frame.thumbnailUrl ? (
                    <Image src={frame.thumbnailUrl} alt={frame.name} width={128} height={128} unoptimized style={{ width: '100%', height: 128, objectFit: 'contain' }} />
                  ) : (
                    <span aria-hidden>Image</span>
                  )}
                  <strong style={{ display: '-webkit-box', fontSize: '0.875rem', overflow: 'hidden', textAlign: 'center', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>
                    {frame.name}
                  </strong>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <SemanticButton action="partner-frames:save-defaults" onClick={handleSave} loading={isSaving}>
          {isSaving ? 'Saving...' : `Save Defaults (${defaultFrames.length} selected)`}
        </SemanticButton>
        <Link href={`/admin/partners/${partnerId}`} style={{ textDecoration: 'none' }}>
          <SemanticButton action="partner-frames:cancel" variant="secondary">Cancel</SemanticButton>
        </Link>
      </div>
    </div>
  );
}
