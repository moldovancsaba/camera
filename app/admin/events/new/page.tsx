/**
 * Add New Event Page
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
  Anchor,
  Breadcrumbs,
  Button,
  Checkbox,
  FileInput,
  Grid,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconAlertCircle, IconX } from '@tabler/icons-react';
import PartnerSearchDropdown from '@/components/admin/PartnerSearchDropdown';
import { defaultGoShortOrigin } from '@/lib/site-hosts';
import { FormSection } from '@doneisbetter/gds-admin/client';
import { StateBlock } from '@doneisbetter/gds-core/client';
import EditorScaffold from '@/components/gds/EditorScaffold';
import MediaCard from '@/components/media/MediaPreviewCard';
import type { TryOnSuitOption } from '@/lib/tryon/suits';
import type { EventTryOnResultSlideshowMode } from '@/lib/tryon/slideshow-policy';

interface PartnerOption {
  _id: string;
  partnerId: string;
  name: string;
}

interface CreateEventResponse {
  data?: { event?: { _id: string } };
  event?: { _id: string };
  error?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function NewEventPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPartnerId = searchParams.get('partnerId');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPartners, setIsLoadingPartners] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(preselectedPartnerId);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [tryOnEnabled, setTryOnEnabled] = useState(false);
  const [resultSlideshowMode, setResultSlideshowMode] =
    useState<EventTryOnResultSlideshowMode>('disabled');
  const [suitOptions, setSuitOptions] = useState<TryOnSuitOption[]>([]);
  const [selectedSuitIds, setSelectedSuitIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const response = await fetch('/api/partners?active=true&limit=100');
        const data: {
          data?: { partners?: PartnerOption[] };
          partners?: PartnerOption[];
          error?: string;
        } = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load partners');
        }

        setPartners(data.data?.partners || data.partners || []);
        setIsLoadingPartners(false);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
        setIsLoadingPartners(false);
      }
    };

    void fetchPartners();
  }, []);

  useEffect(() => {
    const fetchSuits = async () => {
      try {
        const response = await fetch('/api/tryon/suits');
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load leather suits');
        }
        setSuitOptions(payload.data?.suits ?? payload.suits ?? []);
      } catch {
        setSuitOptions([]);
      }
    };

    void fetchSuits();
  }, []);

  const handleLogoChange = (file: File | null) => {
    setLogoFile(file);
    if (!file) {
      setLogoPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    let logoUrl: string | undefined;
    if (logoFile) {
      try {
        setIsUploadingLogo(true);
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(logoFile);
        });

        const uploadResponse = await fetch('/api/upload-logo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: base64Data,
            name: `event-logo-${Date.now()}`,
          }),
        });

        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        logoUrl = uploadResult?.data?.imageUrl;
        if (!logoUrl) {
          throw new Error('Upload finished without an image URL');
        }
      } catch (err: unknown) {
        setError(`Failed to upload logo: ${getErrorMessage(err)}`);
        setIsSubmitting(false);
        setIsUploadingLogo(false);
        return;
      } finally {
        setIsUploadingLogo(false);
      }
    }

    const data = {
      name: formData.get('name') as string,
      partnerId: formData.get('partnerId') as string,
      description: formData.get('description') as string,
      eventDate: formData.get('eventDate') as string,
      location: formData.get('location') as string,
      shortUrlSlug: (formData.get('shortUrlSlug') as string) ?? '',
      isActive: formData.get('isActive') === 'on',
      logoUrl,
      showLogo: formData.get('showLogo') === 'on',
      tryOn: {
        enabled: tryOnEnabled,
        allowedLeatherSuitIds: selectedSuitIds,
        includeApprovedResultsInSlideshows: resultSlideshowMode !== 'disabled',
        resultSlideshowMode,
      },
    };

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result: CreateEventResponse = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create event');
      }

      const event = result.data?.event || result.event;
      if (!event?._id) {
        throw new Error('Invalid response from server');
      }

      router.push(`/admin/events/${event._id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  if (isLoadingPartners) {
    return <StateBlock variant="loading" title="Loading partners…" />;
  }

  return (
    <EditorScaffold
      eyebrow="Events App"
      title="Create Event App Instance"
      description="Create a new event runtime for a partner using shared Camera Core resources and partner defaults."
      breadcrumbs={
        <Breadcrumbs>
          <Anchor component={Link} href="/admin/events" size="sm">
            Events
          </Anchor>
          <Text size="sm">New</Text>
        </Breadcrumbs>
      }
    >

      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          <Text fw={700}>Error</Text>
          <Text size="sm">{error}</Text>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <FormSection title="Partner" description="The partner workspace this event app instance belongs to.">
            {partners.length === 0 ? (
              <Alert color="yellow">
                No active partners found.{' '}
                <Anchor component={Link} href="/admin/partners/new">
                  Create a partner first
                </Anchor>
                .
              </Alert>
            ) : (
              <PartnerSearchDropdown
                partners={partners}
                selectedPartnerId={selectedPartnerId}
                onSelect={(partnerId) => setSelectedPartnerId(partnerId)}
                required
              />
            )}
          </FormSection>

          <FormSection
            title="Event details"
            description="Configure the base instance. Frames, logos, landing pages, and slideshows can be set up after creation."
          >
            <TextInput name="name" label="Event name" required placeholder="e.g., Serie A - AC Milan x AS Roma" />
            <Textarea name="description" label="Description" rows={3} placeholder="Optional event description…" />
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput name="eventDate" label="Event date" type="date" />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput name="location" label="Location" placeholder="e.g., San Siro, Milan" />
              </Grid.Col>
            </Grid>
            <TextInput
              name="shortUrlSlug"
              label="Short link slug (optional)"
              description={`When set, ${defaultGoShortOrigin()}/your-slug redirects to this event’s capture page after save.`}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
              placeholder="e.g. selfie"
            />
          </FormSection>

          <FormSection title="Customization">
            {logoPreview ? (
              <MediaCard
                src={logoPreview}
                alt="Logo preview"
                caption={logoFile?.name}
                ratio={1}
                padding={20}
                action={
                  <Button
                    type="button"
                    variant="light"
                    color="red"
                    leftSection={<IconX size={16} />}
                    onClick={() => {
                      setLogoFile(null);
                      setLogoPreview(null);
                    }}
                  >
                    Clear logo
                  </Button>
                }
              />
            ) : (
              <FileInput
                label="Event logo"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                description="JPEG, PNG, or WebP (max 32MB)."
                onChange={handleLogoChange}
              />
            )}
            <Checkbox
              name="showLogo"
              disabled={!logoFile && !logoPreview}
              label="Display logo on event pages"
            />
          </FormSection>

          <FormSection
            title="Try-on"
            description="Optionally allow this event to queue local AI leather try-on jobs after Camera saves the normal submission."
          >
            <Group justify="flex-end">
              <Anchor component={Link} href="/admin/tryon/suits" size="sm">
                Manage leather jerseys
              </Anchor>
            </Group>
            <Checkbox
              checked={tryOnEnabled}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setTryOnEnabled(checked);
                if (!checked) {
                  setResultSlideshowMode('disabled');
                }
              }}
              label="Enable local AI leather try-on for this event"
            />
            <Select
              label="Approved result slideshow publication"
              description="Control whether approved try-on results are hidden, mixed with originals, or result-only in slideshow playlists for this event."
              data={[
                { value: 'disabled', label: 'Disabled (approved results hidden from slideshows)' },
                { value: 'mixed_with_originals', label: 'Mixed with originals' },
                { value: 'approved_results_only', label: 'Approved results only' },
              ]}
              value={resultSlideshowMode}
              disabled={!tryOnEnabled}
              onChange={(value) =>
                setResultSlideshowMode((value as EventTryOnResultSlideshowMode) || 'disabled')
              }
            />
            <Select
              label="Allowed leather jerseys"
              description="Leave empty to allow the full active suit catalog when try-on is enabled."
              placeholder={suitOptions.length > 0 ? 'Select one or more leather jerseys' : 'No active leather jerseys found'}
              data={suitOptions.map((suit) => ({ value: suit.id, label: suit.name }))}
              value={null}
              disabled={!tryOnEnabled || suitOptions.length === 0}
              searchable
              clearable
              onChange={(value) => {
                if (!value || selectedSuitIds.includes(value)) return;
                setSelectedSuitIds((current) => [...current, value]);
              }}
            />
            {selectedSuitIds.length > 0 ? (
              <Group gap="xs">
                {selectedSuitIds.map((suitId) => {
                  const suit = suitOptions.find((option) => option.id === suitId);
                  return (
                    <Button
                      key={suitId}
                      type="button"
                      size="xs"
                      variant="light"
                      onClick={() =>
                        setSelectedSuitIds((current) => current.filter((value) => value !== suitId))
                      }
                    >
                      Remove {suit?.name ?? suitId}
                    </Button>
                  );
                })}
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                No suit allowlist selected.
              </Text>
            )}
          </FormSection>

          <FormSection title="Status">
            <Checkbox name="isActive" defaultChecked label="Make event active (visible and usable)" />
            <Text size="sm" c="dimmed">
              Inactive events will not be available for frame selection.
            </Text>
          </FormSection>

          <Group>
            <Button
              type="submit"
              color="cameraTeal"
              loading={isSubmitting || isUploadingLogo}
              disabled={partners.length === 0}
            >
              {isUploadingLogo ? 'Uploading logo…' : isSubmitting ? 'Creating…' : 'Create event'}
            </Button>
            <Button type="button" variant="default" onClick={() => router.back()}>
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
