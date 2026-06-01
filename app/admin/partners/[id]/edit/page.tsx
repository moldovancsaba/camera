'use client';

/**
 * Edit Partner Page
 *
 * Form to edit partner details and partner-level default event styles.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Code,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import EditorScaffold from '@/components/gds/EditorScaffold';
import { FormSection } from '@doneisbetter/gds-admin/client';
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
    return (
      <Stack align="center" justify="center" mih="50vh">
        <Text fz={40}>⏳</Text>
        <Text c="dimmed">Loading partner...</Text>
      </Stack>
    );
  }

  if (error && !partner) {
    return (
      <Stack gap="lg">
        <Alert icon={<IconAlertCircle size={16} />}>
          <Text fw={700}>Error</Text>
          <Text size="sm">{error}</Text>
        </Alert>
        <Link href="/admin/partners">← Back to Partners</Link>
      </Stack>
    );
  }

  return (
    <EditorScaffold
      eyebrow="Camera Core"
      title="Edit Partner"
      description="Update partner information"
      breadcrumbs={
        <Breadcrumbs>
          <Link href="/admin/partners">Partners</Link>
          <Link href={`/admin/partners/${partnerId}`}>{partner?.name}</Link>
          <Text>Edit</Text>
        </Breadcrumbs>
      }
    >

      {error ? (
        <Alert icon={<IconAlertCircle size={16} />}>
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
              defaultValue={partner?.name}
              placeholder="e.g., AC Milan, Red Bull, Nike"
              description="The name of the partner organization or brand"
            />
            <Textarea
              name="description"
              label="Description"
              rows={3}
              defaultValue={partner?.description || ''}
              placeholder="Optional description..."
            />
          </FormSection>

          <FormSection title="Contact Information">
            <TextInput name="contactName" label="Contact Person" defaultValue={partner?.contactName || ''} placeholder="e.g., John Doe" />
            <TextInput name="contactEmail" type="email" label="Contact Email" defaultValue={partner?.contactEmail || ''} placeholder="e.g., contact@partner.com" />
          </FormSection>

          <FormSection
            title="Default Styles for Events"
            description="Set default brand colors that will automatically apply to all new events under this partner. Events can override these later to become independent."
          >
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <ColorInput
                label="Default Primary Color"
                value={primaryColor}
                onChange={setPrimaryColor}
                description="Used for buttons, focus states"
                format="hex"
              />
              <ColorInput
                label="Default Border/Accent Color"
                value={secondaryColor}
                onChange={setSecondaryColor}
                description="Used for borders, inputs, checkboxes"
                format="hex"
              />
            </SimpleGrid>
            <Text size="sm" c="dimmed">
              💡 <strong>Note:</strong> Changes to default styles will automatically update all child events that have
              not been customized (marked with 🟢). Events with custom styles (marked with 🔴) will keep their own
              values.
            </Text>
          </FormSection>

          <Card>
            <Stack gap="xs">
              <Checkbox name="isActive" defaultChecked={partner?.isActive} label="Partner is active (visible and usable)" />
              <Text size="sm" c="dimmed">
                Inactive partners will not be available for event creation
              </Text>
            </Stack>
          </Card>

          <Card bg="var(--mantine-color-gray-0)">
            <Stack gap="xs">
              <Text size="sm" fw={600} c="dimmed">
                Partner ID (Read-only)
              </Text>
              <Code block>{partner?.partnerId}</Code>
              <Text size="sm" c="dimmed">
                This ID is used to reference the partner across the system
              </Text>
            </Stack>
          </Card>

          <Stack gap="sm">
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
            <Link href={`/admin/partners/${partnerId}`} style={{ textDecoration: 'none' }}>
              <Button variant="default">Cancel</Button>
            </Link>
          </Stack>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
