'use client';

/**
 * Edit Partner Page
 *
 * Form to edit partner details and partner-level default event styles.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { FormSection } from '@doneisbetter/gds-admin/client';
import { InlineAlert, SemanticButton, StateBlock } from '@doneisbetter/gds-core/client';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';

interface PartnerRecord {
  partnerId: string;
  name: string;
  description?: string;
  contactEmail?: string;
  contactName?: string;
  isActive?: boolean;
  defaultBrandColors?: {
    primary?: string;
    secondary?: string;
  };
}

interface UpdatePartnerPayload {
  name: string;
  description: string;
  contactEmail: string;
  contactName: string;
  isActive: boolean;
  defaultBrandColors?: {
    primary?: string;
    secondary?: string;
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Partner request failed';
}

export default function EditPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partner, setPartner] = useState<PartnerRecord | null>(null);
  const [primaryColor, setPrimaryColor] = useState(CAMERA_DEFAULT_BRAND_COLOR);
  const [secondaryColor, setSecondaryColor] = useState(CAMERA_DEFAULT_BRAND_BORDER_COLOR);

  useEffect(() => {
    params.then((resolved) => setPartnerId(resolved.id));
  }, [params]);

  useEffect(() => {
    if (!partnerId) return;

    const fetchPartner = async () => {
      try {
        const response = await fetch(`/api/partners/${partnerId}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load partner');
        }

        const partnerRecord = data.partner ?? data.data?.partner;
        setPartner(partnerRecord);
        setPrimaryColor(partnerRecord.defaultBrandColors?.primary || CAMERA_DEFAULT_BRAND_COLOR);
        setSecondaryColor(partnerRecord.defaultBrandColors?.secondary || CAMERA_DEFAULT_BRAND_BORDER_COLOR);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchPartner();
  }, [partnerId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data: UpdatePartnerPayload = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      contactEmail: formData.get('contactEmail') as string,
      contactName: formData.get('contactName') as string,
      isActive: formData.get('isActive') === 'on',
    };

    if (primaryColor || secondaryColor) {
      data.defaultBrandColors = {
        primary: primaryColor || undefined,
        secondary: secondaryColor || undefined,
      };
    }

    try {
      const response = await fetch(`/api/partners/${partnerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update partner');
      }

      router.push(`/admin/partners/${partnerId}`);
      router.refresh();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading partner..." />;
  }

  if (error && !partner) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <InlineAlert title="Error" message={error} severity="error" />
        <Link href="/admin/partners">← Back to Partners</Link>
      </div>
    );
  }

  return (
    <EditorScaffold
      eyebrow="Camera Core"
      title="Edit Partner"
      description="Update partner information"
      breadcrumbs={
        <nav aria-label="Breadcrumb">
          <Link href="/admin/partners">Partners</Link>
          <span aria-hidden> / </span>
          <Link href={`/admin/partners/${partnerId}`}>{partner?.name}</Link>
          <span aria-hidden> / </span>
          <span>Edit</span>
        </nav>
      }
    >

      {error ? (
        <InlineAlert title="Error" message={error} severity="error" />
      ) : null}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FormSection title="Basic Information">
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Partner Name *
              <input
              name="name"
              required
              defaultValue={partner?.name}
              placeholder="e.g., AC Milan, Red Bull, Nike"
              aria-describedby="partner-name-help"
              style={{ minHeight: 44, padding: '0 0.75rem' }}
            />
              <span id="partner-name-help" style={{ color: 'var(--gds-color-muted)', fontSize: '0.8125rem', fontWeight: 400 }}>
                The name of the partner organization or brand.
              </span>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Description
              <textarea
              name="description"
              rows={3}
              defaultValue={partner?.description || ''}
              placeholder="Optional description..."
              style={{ padding: '0.75rem' }}
            />
            </label>
          </FormSection>

          <FormSection title="Contact Information">
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Contact Person
              <input name="contactName" defaultValue={partner?.contactName || ''} placeholder="e.g., John Doe" style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Contact Email
              <input name="contactEmail" type="email" defaultValue={partner?.contactEmail || ''} placeholder="e.g., contact@partner.com" style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
          </FormSection>

          <FormSection
            title="Default Styles for Events"
            description="Set default brand colors that will automatically apply to all new events under this partner. Events can override these later to become independent."
          >
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
              <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
                Default Primary Color
                <input
                type="color"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.currentTarget.value)}
                aria-describedby="partner-primary-color-help"
                style={{ minHeight: 44 }}
              />
                <span id="partner-primary-color-help" style={{ color: 'var(--gds-color-muted)', fontSize: '0.8125rem', fontWeight: 400 }}>
                  Used for buttons and focus states.
                </span>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
                Default Border/Accent Color
                <input
                type="color"
                value={secondaryColor}
                onChange={(event) => setSecondaryColor(event.currentTarget.value)}
                aria-describedby="partner-secondary-color-help"
                style={{ minHeight: 44 }}
              />
                <span id="partner-secondary-color-help" style={{ color: 'var(--gds-color-muted)', fontSize: '0.8125rem', fontWeight: 400 }}>
                  Used for borders, inputs, and checkboxes.
                </span>
              </label>
            </div>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
              Changes to default styles automatically update child events that still inherit partner defaults. Events with custom styles keep their own values.
            </p>
          </FormSection>

          <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
                <input type="checkbox" name="isActive" defaultChecked={partner?.isActive} />
                Partner is active (visible and usable)
              </label>
              <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
                Inactive partners will not be available for event creation
              </p>
            </div>
          </section>

          <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <strong style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem' }}>
                Partner ID (Read-only)
              </strong>
              <code style={{ display: 'block' }}>{partner?.partnerId}</code>
              <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
                This ID is used to reference the partner across the system
              </p>
            </div>
          </section>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="partners:save" type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </SemanticButton>
            <Link href={`/admin/partners/${partnerId}`} style={{ textDecoration: 'none' }}>
              <SemanticButton action="partners:cancel-edit" variant="secondary">Cancel</SemanticButton>
            </Link>
          </div>
        </div>
      </form>
    </EditorScaffold>
  );
}
