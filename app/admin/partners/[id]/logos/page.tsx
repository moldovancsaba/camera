'use client';

/**
 * Partner Default Logos Management Page
 *
 * Manage default logo assignments for a partner.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { InlineAlert, LabelTag, SemanticButton, StateBlock } from '@doneisbetter/gds-core/client';

interface DefaultLogoAssignment {
  logoId: string;
  scenario: string;
  order: number;
}

interface PartnerRecord {
  name: string;
  defaultLogos?: DefaultLogoAssignment[];
}

interface LogoRecord {
  logoId: string;
  name: string;
  thumbnailUrl?: string;
}

interface PartnerResponse {
  data?: { partner?: PartnerRecord };
  partner?: PartnerRecord;
  error?: string;
}

interface LogosResponse {
  data?: { logos?: LogoRecord[] };
  error?: string;
}

const scenarios = [
  { id: 'slideshow-transition', name: 'Slideshow Transitions' },
  { id: 'onboarding-thankyou', name: 'Custom Pages' },
  { id: 'loading-slideshow', name: 'Loading Slideshow' },
  { id: 'loading-capture', name: 'Loading Capture' },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function PartnerLogosPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState('');
  const [partner, setPartner] = useState<PartnerRecord | null>(null);
  const [availableLogos, setAvailableLogos] = useState<LogoRecord[]>([]);
  const [defaultLogos, setDefaultLogos] = useState<DefaultLogoAssignment[]>([]);
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
        setDefaultLogos(partnerRecord.defaultLogos || []);

        const logosResponse = await fetch('/api/logos?active=true&limit=100');
        const logosData: LogosResponse = await logosResponse.json();
        if (!logosResponse.ok) {
          throw new Error(logosData.error || 'Failed to load logos');
        }

        setAvailableLogos(logosData.data?.logos || []);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [partnerId]);

  const handleToggleLogo = (logoId: string, scenario: string) => {
    setDefaultLogos((current) => {
      const exists = current.find((logo) => logo.logoId === logoId && logo.scenario === scenario);
      return exists
        ? current.filter((logo) => !(logo.logoId === logoId && logo.scenario === scenario))
        : [...current, { logoId, scenario, order: current.length }];
    });
  };

  const isLogoSelected = (logoId: string, scenario: string) =>
    defaultLogos.some((logo) => logo.logoId === logoId && logo.scenario === scenario);

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
        <span>Default Logos</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Manage Default Logos"
        description={`Select logos by scenario that will be automatically assigned to new events under ${partner.name}`}
      />

      <InlineAlert
        title="Default inheritance"
        message="Changes automatically cascade to child events that still inherit partner defaults. Events with custom logos keep their selections."
        severity="info"
      />

      {availableLogos.length === 0 ? (
        <StateBlock variant="empty" title="No logos available" description="Create logos first to assign them as defaults." />
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {scenarios.map((scenario) => (
            <section key={scenario.id} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
              <div style={{ alignItems: 'center', borderBottom: '1px solid var(--gds-color-border)', display: 'flex', gap: '1rem', justifyContent: 'space-between', padding: '1rem' }}>
                <h3 style={{ margin: 0 }}>{scenario.name}</h3>
                <LabelTag tone="neutral" label={`${defaultLogos.filter((logo) => logo.scenario === scenario.id).length} selected`} />
              </div>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', padding: '1rem' }}>
                {availableLogos.map((logo) => {
                  const selected = isLogoSelected(logo.logoId, scenario.id);
                  return (
                    <button
                      key={`${logo.logoId}-${scenario.id}`}
                      type="button"
                      aria-pressed={selected}
                      style={{ background: 'var(--gds-color-surface)', border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', cursor: 'pointer', padding: '1rem' }}
                      onClick={() => handleToggleLogo(logo.logoId, scenario.id)}
                    >
                      <span style={{ alignItems: 'center', display: 'grid', gap: '0.75rem', justifyItems: 'center' }}>
                        {selected ? <LabelTag tone="success" label="Selected" /> : null}
                        {logo.thumbnailUrl ? (
                          <Image src={logo.thumbnailUrl} alt={logo.name} width={80} height={80} unoptimized style={{ width: '100%', height: 64, objectFit: 'contain' }} />
                        ) : (
                          <span aria-hidden>Logo</span>
                        )}
                        <strong style={{ display: '-webkit-box', fontSize: '0.75rem', overflow: 'hidden', textAlign: 'center', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>
                          {logo.name}
                        </strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <SemanticButton action="partner-logos:save-defaults" onClick={handleSave} loading={isSaving}>
          {isSaving ? 'Saving...' : `Save Defaults (${defaultLogos.length} selected)`}
        </SemanticButton>
        <Link href={`/admin/partners/${partnerId}`} style={{ textDecoration: 'none' }}>
          <SemanticButton action="partner-logos:cancel" variant="secondary">Cancel</SemanticButton>
        </Link>
      </div>
    </div>
  );
}
