/**
 * Add New Event Page
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
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
  Textarea,
  TextInput,
} from '@/components/gds/PublicPrimitives';
import PartnerSearchDropdown from '@/components/admin/PartnerSearchDropdown';
import { defaultGoShortOrigin } from '@/lib/site-hosts';
import { FormSection } from '@sovereignsquad/gds-admin/client';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import MediaCard from '@/components/media/MediaPreviewCard';
import {
  DEFAULT_EVENT_BUTTON_SIZE,
  EVENT_BUTTON_SIZE_OPTIONS,
  type EventButtonSize,
} from '@/lib/events/visual-settings';
import {
  DEFAULT_EVENT_SHARE_PAGE_SETTINGS,
} from '@/lib/events/share-page-settings';

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
  const [buttonSize, setButtonSize] = useState<EventButtonSize>(DEFAULT_EVENT_BUTTON_SIZE);
  const [includeOriginalCapture, setIncludeOriginalCapture] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.includeOriginalCapture
  );
  const [includeCameraResult, setIncludeCameraResult] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.includeCameraResult
  );
  const [showCreateYourOwnButton, setShowCreateYourOwnButton] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.showCreateYourOwnButton
  );

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        // Alphabetical, every page: the list holds more than one page of partners (camera#375: 100 newest of 258 were all the picker had).
        const all: PartnerOption[] = [];
        for (let page = 1, pages = 1; page <= pages && page <= 50; page++) {
          const response = await fetch(`/api/partners?active=true&sort=name&limit=100&page=${page}`);
          const data: {
            data?: { partners?: PartnerOption[]; pagination?: { pages?: number } };
            partners?: PartnerOption[];
            error?: string;
          } = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Failed to load partners');
          }

          all.push(...(data.data?.partners || data.partners || []));
          pages = data.data?.pagination?.pages ?? 1;
        }

        setPartners(all);
        setIsLoadingPartners(false);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
        setIsLoadingPartners(false);
      }
    };

    void fetchPartners();
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
      loadingText: formData.get('loadingText') as string,
      shortUrlSlug: (formData.get('shortUrlSlug') as string) ?? '',
      isActive: formData.get('isActive') === 'on',
      logoUrl,
      showLogo: formData.get('showLogo') === 'on',
      visualSettings: {
        buttonSize,
      },
      sharePage: {
        includeOriginalCapture,
        includeCameraResult,
        showCreateYourOwnButton,
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
      eyebrow="Events"
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
        <InlineAlert title="Error" message={error} severity="error" />
      ) : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <FormSection title="Partner" description="The partner workspace this event app instance belongs to.">
            {partners.length === 0 ? (
              <InlineAlert title="No active partners found" message={
                <>
                No active partners found.{' '}
                <Anchor component={Link} href="/admin/partners/new">
                  Create a partner first
                </Anchor>
                .
                </>
              } severity="warning" />
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
              label="URL slug (optional)"
              description={`When set, ${defaultGoShortOrigin()}/your-slug redirects to this event’s capture page after save.`}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
              placeholder="e.g. selfie"
            />
          </FormSection>

          <FormSection title="Customization">
            <Select
              label="Button size"
              description="Controls the primary action button size across this event app."
              data={EVENT_BUTTON_SIZE_OPTIONS}
              value={buttonSize}
              onChange={(value) => setButtonSize((value as EventButtonSize) || DEFAULT_EVENT_BUTTON_SIZE)}
            />

            <TextInput
              name="loadingText"
              label="Loading text"
              defaultValue="Loading event..."
              description="Text shown while the event is loading."
            />

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
            title="Public result page"
            description="Control which related photos are shown on the shareable result page linked from email and share actions."
          >
            <Checkbox
              checked={includeOriginalCapture}
              onChange={(event) => setIncludeOriginalCapture(event.currentTarget.checked)}
              label="Show original photo taken"
              description="Available when the raw camera image was uploaded as a try-on source."
            />
            <Checkbox
              checked={includeCameraResult}
              onChange={(event) => setIncludeCameraResult(event.currentTarget.checked)}
              label="Show photo with Camera frame"
              description="The normal Camera submission saved by the capture flow."
            />
            <Checkbox
              checked={showCreateYourOwnButton}
              onChange={(event) => setShowCreateYourOwnButton(event.currentTarget.checked)}
              label="Show Create Your Own button"
              description="Display a CTA on the shared photo page that returns users to capture and start a new photo."
            />
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
