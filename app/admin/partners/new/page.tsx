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
import { AdminCheckbox, AdminCrudForm, AdminFormSection, AdminTextInput, AdminTextarea } from '@sovereignsquad/gds-admin/client';
import { InlineAlert } from '@sovereignsquad/gds-core/client';

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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isActive, setIsActive] = useState(true);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const data = { name, description, contactEmail, contactName, isActive };

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
        <AdminCrudForm title="Partner details" description="Create a new partner organization.">
          <AdminFormSection title="Basic information">
            <AdminTextInput
              name="name"
              label="Partner name"
              value={name}
              onChange={setName}
              required
              placeholder="e.g., AC Milan, Red Bull, Nike"
              description="The name of the partner organization or brand."
            />
            <AdminTextarea name="description" label="Description" value={description} onChange={setDescription} placeholder="Optional description..." />
          </AdminFormSection>

          <AdminFormSection title="Contact information">
            <AdminTextInput name="contactName" label="Contact person" value={contactName} onChange={setContactName} placeholder="e.g., John Doe" />
            <AdminTextInput name="contactEmail" label="Contact email" type="email" value={contactEmail} onChange={setContactEmail} placeholder="e.g., contact@partner.com" />
          </AdminFormSection>

          <AdminFormSection title="Status">
            <AdminCheckbox
              name="isActive"
              label="Make partner active (visible and usable)"
              description="Inactive partners will not be available for event creation"
              checked={isActive}
              onChange={setIsActive}
            />
          </AdminFormSection>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="partners:create" type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Partner'}
            </SemanticButton>
            <SemanticButton action="partners:cancel-create" variant="secondary" onClick={() => router.back()}>
              Cancel
            </SemanticButton>
          </div>
        </AdminCrudForm>
      </form>
    </EditorScaffold>
  );
}
