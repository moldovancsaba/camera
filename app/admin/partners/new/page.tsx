'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
/**
 * Add New Partner Page
 *
 * Form to create a new partner organization.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { FormSection } from '@doneisbetter/gds-admin/client';
import { InlineAlert } from '@doneisbetter/gds-core/client';

interface CreatePartnerResponse {
  partner?: { _id?: string };
  data?: { partner?: { _id?: string } };
  error?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function NewPartnerPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      contactEmail: formData.get('contactEmail') as string,
      contactName: formData.get('contactName') as string,
      isActive: formData.get('isActive') === 'on',
    };

    try {
      const response = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = (await response.json()) as CreatePartnerResponse;
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create partner');
      }

      const partner = result.data?.partner || result.partner;
      if (!partner || !partner._id) {
        throw new Error('Invalid response from server');
      }

      router.push(`/admin/partners/${partner._id}`);
      router.refresh();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      setIsSubmitting(false);
    }
  };

  return (
    <EditorScaffold
      eyebrow="Camera Core"
      title="Add New Partner"
      description="Create a new partner organization"
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
              placeholder="e.g., AC Milan, Red Bull, Nike"
              aria-describedby="partner-name-description"
              style={{ minHeight: 44, padding: '0 0.75rem' }}
            />
              <span id="partner-name-description" style={{ color: 'var(--gds-color-muted)', fontSize: '0.8125rem', fontWeight: 400 }}>
                The name of the partner organization or brand.
              </span>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Description
              <textarea name="description" rows={3} placeholder="Optional description..." style={{ padding: '0.75rem' }} />
            </label>
          </FormSection>

          <FormSection title="Contact Information">
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Contact Person
              <input name="contactName" placeholder="e.g., John Doe" style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Contact Email
              <input name="contactEmail" type="email" placeholder="e.g., contact@partner.com" style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
          </FormSection>

          <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
                <input type="checkbox" name="isActive" defaultChecked />
                Make partner active (visible and usable)
              </label>
              <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
                Inactive partners will not be available for event creation
              </p>
            </div>
          </section>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="partners:create" type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Partner'}
            </SemanticButton>
            <SemanticButton action="partners:cancel-create" variant="secondary" onClick={() => router.back()}>
              Cancel
            </SemanticButton>
          </div>
        </div>
      </form>
    </EditorScaffold>
  );
}
