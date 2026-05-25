/**
 * Edit Event Page
 *
 * Form to edit event details and manage custom page flows.
 */

'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
  Anchor,
  Breadcrumbs,
  Button,
  Checkbox,
  Code,
  ColorInput,
  FileInput,
  Grid,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconAlertCircle, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { type CustomPage } from '@/lib/db/schemas';
import CustomPagesManager from '@/components/admin/CustomPagesManager';
import { defaultGoShortOrigin } from '@/lib/site-hosts';
import FormSection from '@/components/gds/FormSection';
import StateBlock from '@/components/gds/StateBlock';
import EditorScaffold from '@/components/gds/EditorScaffold';

interface EventRecord {
  _id: string;
  name: string;
  partnerName?: string;
  description?: string;
  eventDate?: string;
  location?: string;
  loadingText?: string;
  isActive?: boolean;
  logoUrl?: string;
  showLogo?: boolean;
  brandColor?: string;
  brandBorderColor?: string;
  shortUrlSlug?: string;
  eventId?: string;
  customPages?: CustomPage[];
}

interface EventResponse {
  data?: {
    event?: EventRecord;
  };
  event?: EventRecord;
  error?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [mongoId, setMongoId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [brandColor, setBrandColor] = useState('#3B82F6');
  const [brandBorderColor, setBrandBorderColor] = useState('#3B82F6');
  const [customPages, setCustomPages] = useState<CustomPage[]>([]);

  useEffect(() => {
    params.then((p) => setMongoId(p.id));
  }, [params]);

  useEffect(() => {
    if (!mongoId) return;

    const fetchEvent = async () => {
      try {
        const response = await fetch(`/api/events/${mongoId}`);
        const data: EventResponse = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load event');
        }

        const eventData = data.data?.event || data.event;
        if (!eventData) {
          throw new Error('Event not found');
        }

        setEvent(eventData);
        setCustomPages(eventData.customPages || []);
        setLogoPreview(eventData.logoUrl || null);
        setBrandColor(eventData.brandColor || '#3B82F6');
        setBrandBorderColor(eventData.brandBorderColor || '#3B82F6');
        setIsLoading(false);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
        setIsLoading(false);
      }
    };

    void fetchEvent();
  }, [mongoId]);

  const handleLogoChange = (file: File | null) => {
    setLogoFile(file);
    if (!file) {
      setLogoPreview(event?.logoUrl || null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview(event?.logoUrl || null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    let logoUrl: string | undefined = event?.logoUrl;
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
      description: formData.get('description') as string,
      eventDate: formData.get('eventDate') as string,
      location: formData.get('location') as string,
      loadingText: formData.get('loadingText') as string,
      isActive: formData.get('isActive') === 'on',
      logoUrl,
      showLogo: formData.get('showLogo') === 'on',
      brandColor: brandColor || undefined,
      brandBorderColor: brandBorderColor || undefined,
      shortUrlSlug: (formData.get('shortUrlSlug') as string) ?? '',
    };

    try {
      const response = await fetch(`/api/events/${mongoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update event');
      }

      router.push(`/admin/events/${mongoId}`);
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading event…" />;
  }

  if (error && !event) {
    return (
      <Stack gap="lg" maw={960} mx="auto">
        <StateBlock
          variant="error"
          title="Could not load event"
          description={error}
          action={
            <Button component={Link} href="/admin/events" variant="light">
              Back to Events
            </Button>
          }
        />
      </Stack>
    );
  }

  return (
    <EditorScaffold
      eyebrow="Events App"
      title="Edit Event"
      description="Update event information and capture experience settings."
      breadcrumbs={
        <Breadcrumbs>
          <Anchor component={Link} href="/admin/events" size="sm">
            Events
          </Anchor>
          <Anchor component={Link} href={`/admin/events/${mongoId}`} size="sm">
            {event?.name}
          </Anchor>
          <Text size="sm">Edit</Text>
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
          <FormSection title="Partner" description="Partner cannot be changed after event creation.">
            <TextInput label="Partner (read-only)" value={event?.partnerName || ''} readOnly />
          </FormSection>

          <FormSection title="Event details">
            <TextInput name="name" label="Event name" required defaultValue={event?.name} />
            <Textarea
              name="description"
              label="Description"
              rows={3}
              defaultValue={event?.description || ''}
              placeholder="Optional event description…"
            />
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  name="eventDate"
                  label="Event date"
                  type="date"
                  defaultValue={event?.eventDate ? event.eventDate.split('T')[0] : ''}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  name="location"
                  label="Location"
                  defaultValue={event?.location || ''}
                  placeholder="e.g., San Siro, Milan"
                />
              </Grid.Col>
            </Grid>
            <TextInput
              name="shortUrlSlug"
              label="Short link slug (optional)"
              defaultValue={event?.shortUrlSlug || ''}
              description={`Lowercase letters, digits, and hyphens (2–63 chars). When set, ${defaultGoShortOrigin()}/your-slug redirects to this event’s capture page.`}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
            />
          </FormSection>

          <FormSection title="Customization">
            <TextInput
              name="loadingText"
              label="Loading text"
              defaultValue={event?.loadingText || 'Loading event...'}
              description="Text shown while the event is loading."
            />

            {logoPreview ? (
              <Stack gap="sm">
                <Text size="sm" fw={500}>
                  Event logo
                </Text>
                <Group gap="md">
                  <Image
                    src={logoPreview}
                    alt="Logo preview"
                    width={96}
                    height={96}
                    unoptimized
                    style={{ borderRadius: 8, border: '1px solid var(--mantine-color-gray-3)' }}
                  />
                  <Button
                    type="button"
                    variant="light"
                    color="red"
                    leftSection={<IconX size={16} />}
                    onClick={clearLogo}
                  >
                    Clear selection
                  </Button>
                </Group>
              </Stack>
            ) : (
              <FileInput
                label="Event logo"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                description="JPEG, PNG, or WebP (max 32MB). Shown during loading and on capture pages."
                onChange={handleLogoChange}
              />
            )}

            <Checkbox
              name="showLogo"
              defaultChecked={event?.showLogo}
              disabled={!logoPreview}
              label="Display logo on event pages"
            />

            <Text fw={600} size="sm">
              Brand colors
            </Text>
            <Text size="xs" c="dimmed">
              Used across the event experience: buttons, inputs, checkboxes, and the camera interface.
            </Text>
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <ColorInput
                  label="Primary color"
                  value={brandColor}
                  onChange={setBrandColor}
                  description="Buttons, capture fill, and focus states."
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <ColorInput
                  label="Border / accent color"
                  value={brandBorderColor}
                  onChange={setBrandBorderColor}
                  description="Input borders, checkboxes, and capture button border."
                />
              </Grid.Col>
            </Grid>
          </FormSection>

          <FormSection title="Status">
            <Checkbox name="isActive" defaultChecked={event?.isActive} label="Event is active (visible and usable)" />
            <Text size="sm" c="dimmed">
              Inactive events will not be available for frame selection.
            </Text>
          </FormSection>

          <FormSection title="Event ID" description="Used to reference the event across slideshow and submission flows.">
            <Code block>{event?.eventId}</Code>
          </FormSection>

          <Group>
            <Button type="submit" color="cameraTeal" loading={isSubmitting || isUploadingLogo}>
              {isUploadingLogo ? 'Uploading logo…' : isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
            <Button component={Link} href={`/admin/events/${mongoId}`} variant="default">
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>

      <CustomPagesManager
        key={customPages.length}
        eventId={mongoId}
        initialPages={customPages}
        onSave={async (pages) => {
          try {
            const response = await fetch(`/api/events/${mongoId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customPages: pages }),
            });

            if (!response.ok) {
              let message = 'Failed to save pages';
              try {
                const result = await response.json();
                message = result.error || message;
              } catch {
                message = `Save failed (HTTP ${response.status})`;
              }
              throw new Error(message);
            }

            const updatedEventResponse = await fetch(`/api/events/${mongoId}`);
            const updatedEventData = await updatedEventResponse.json();
            if (updatedEventResponse.ok) {
              const eventData = updatedEventData.data?.event || updatedEventData.event;
              setCustomPages(eventData?.customPages || []);
              setEvent(eventData);
            }

            notifications.show({
              title: 'Pages saved',
              message: 'Custom page flow updated successfully.',
              color: 'green',
            });
          } catch (err: unknown) {
            throw new Error(getErrorMessage(err));
          }
        }}
      />
    </EditorScaffold>
  );
}
