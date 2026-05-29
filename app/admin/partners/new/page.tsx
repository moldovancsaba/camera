'use client';

/**
 * Add New Partner Page
 *
 * Form to create a new partner organization.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Checkbox, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import EditorScaffold from '@/components/gds/EditorScaffold';
import { FormSection } from '@doneisbetter/gds-admin/client';

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
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          <Text fw={700}>Error</Text>
          <Text size="sm">{error}</Text>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <FormSection title="Basic Information">
            <TextInput
              name="name"
              label="Partner Name *"
              required
              placeholder="e.g., AC Milan, Red Bull, Nike"
              description="The name of the partner organization or brand"
            />
            <Textarea name="description" label="Description" rows={3} placeholder="Optional description..." />
          </FormSection>

          <FormSection title="Contact Information">
            <TextInput name="contactName" label="Contact Person" placeholder="e.g., John Doe" />
            <TextInput name="contactEmail" type="email" label="Contact Email" placeholder="e.g., contact@partner.com" />
          </FormSection>

          <Card>
            <Stack gap="xs">
              <Checkbox name="isActive" defaultChecked label="Make partner active (visible and usable)" />
              <Text size="sm" c="dimmed">
                Inactive partners will not be available for event creation
              </Text>
            </Stack>
          </Card>

          <Stack gap="sm">
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Partner'}
            </Button>
            <Button variant="default" onClick={() => router.back()}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
