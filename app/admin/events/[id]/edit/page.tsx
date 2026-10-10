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
  Anchor,
  Breadcrumbs,
  Button,
  Checkbox,
  ColorInput,
  FileInput,
  Grid,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@/components/gds/PublicPrimitives';
import { useGdsToasts } from '@sovereignsquad/gds-core/client';
import { type CustomPage } from '@/lib/db/schemas';
import CustomPagesManager from '@/components/admin/CustomPagesManager';
import ImagePicker from '@/components/admin/library/ImagePicker';
import { EMAIL_PICTURE_TYPES, EMAIL_PICTURE_WORDS } from '@/lib/library/image-files';
import { defaultGoShortOrigin } from '@/lib/site-hosts';
import { FormSection } from '@sovereignsquad/gds-admin/client';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import type { JourneyContext } from '@/lib/events/journey';
import {
  DEFAULT_EVENT_BUTTON_SIZE,
  EVENT_BUTTON_SIZE_OPTIONS,
  normalizeEventButtonSize,
  type EventButtonSize,
} from '@/lib/events/visual-settings';
import { isUiLanguage, normalizeUiLanguage, UI_LANGUAGES, UI_LANGUAGE_LABELS, type UiLanguage } from '@/lib/i18n';
import { CAMERA_MODES, CAMERA_MODE_LABELS, DEFAULT_CAMERA_MODE, isCameraMode, type CameraMode } from '@/lib/camera/mode';
import {
  DEFAULT_EVENT_SHARE_PAGE_SETTINGS,
  normalizeEventSharePageSettings,
  SHARE_PAGE_TEXT_DEFAULTS,
  type SharePageTextKey,
  type SharePageTexts,
} from '@/lib/events/share-page-settings';

// The fixed words of the public photo page and its notices, in the order of the page (camera#339); an empty field means the text in grey.
const SHARE_TEXT_FIELDS: Array<{ key: SharePageTextKey; label: string; long?: boolean }> = [
  { key: 'downloadButton', label: 'Download button text' },
  { key: 'createYourOwnButton', label: 'Create Your Own button text' },
  { key: 'waitingTitle', label: 'Waiting for approval: heading' },
  { key: 'waitingMessage', label: 'Waiting for approval: text', long: true },
  { key: 'notApprovedTitle', label: 'Not approved: heading' },
  { key: 'notApprovedMessage', label: 'Not approved: text', long: true },
  { key: 'notApprovedHint', label: 'Not approved: hint under the text' },
  { key: 'takeAnotherPhotoButton', label: 'Take another photo button text' },
];

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
  emailFooterImageUrl?: string | null;
  showLogo?: boolean;
  brandColor?: string | null;
  brandBorderColor?: string | null;
  /** The theme the guest pages get (the event API returns it): its button colours are what the colour boxes start from (camera#380). */
  theme?: { buttonBackground?: string; buttonRing?: string };
  shortUrlSlug?: string;
  eventId?: string;
  customPages?: CustomPage[];
  /** What decides which default pages the event gets: the page editor builds the journey from it (camera#378). */
  journeyContext?: JourneyContext;
  /** The consent page is one checkbox on the Who-are-you page (issue 523). */
  acceptanceOnWhoAreYou?: boolean;
  visualSettings?: {
    buttonSize?: EventButtonSize;
  };
  uiLanguage?: string | null;
  tourEnabled?: boolean;
  /** The event's own camera mode (issue 547); `effectiveCameraMode` is what the event uses (its own, else its partner's, else the standard). */
  cameraMode?: string | null;
  effectiveCameraMode?: string | null;
  /** The event's own choice on asking for the permission to show a photo in the public gallery (issue 554) and what it does now (its own, else its partner's, else not). */
  galleryConsent?: boolean | null;
  effectiveGalleryConsent?: boolean;
  sharePage?: {
    showCreateYourOwnButton?: boolean;
    texts?: Record<string, string>;
  };
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
  const { notifySuccess } = useGdsToasts();
  const [mongoId, setMongoId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [emailFooterImageUrl, setEmailFooterImageUrl] = useState('');
  // The brand colours come from messmass by default (camera#380): the boxes only matter while this event has colours of its own, and a save that did not touch
  // them sends none, so the default can never be stored as if somebody had picked it.
  const [ownColours, setOwnColours] = useState(false);
  const [coloursTouched, setColoursTouched] = useState(false);
  const [brandColor, setBrandColor] = useState('');
  const [brandBorderColor, setBrandBorderColor] = useState('');
  const [customPages, setCustomPages] = useState<CustomPage[]>([]);
  const [buttonSize, setButtonSize] = useState<EventButtonSize>(DEFAULT_EVENT_BUTTON_SIZE);
  const [showCreateYourOwnButton, setShowCreateYourOwnButton] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.showCreateYourOwnButton
  );
  const [shareTexts, setShareTexts] = useState<SharePageTexts>({});
  // '' = the event sets no language of its own and follows its partner's (issue 353); the language the event shows now, whichever way, is `shownLanguage`.
  const [uiLanguage, setUiLanguage] = useState<UiLanguage | ''>('');
  const [shownLanguage, setShownLanguage] = useState<UiLanguage>('en');
  const [tourEnabled, setTourEnabled] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode | ''>('');
  const [shownCameraMode, setShownCameraMode] = useState<CameraMode>(DEFAULT_CAMERA_MODE);
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
        setEmailFooterImageUrl(eventData.emailFooterImageUrl || '');
        setOwnColours(Boolean(eventData.brandColor || eventData.brandBorderColor));
        setColoursTouched(false);
        setBrandColor(eventData.brandColor || eventData.theme?.buttonBackground || '');
        setBrandBorderColor(eventData.brandBorderColor || eventData.theme?.buttonRing || '');
        setButtonSize(normalizeEventButtonSize(eventData.visualSettings?.buttonSize));
        const sharePageSettings = normalizeEventSharePageSettings(eventData.sharePage);
        setShowCreateYourOwnButton(sharePageSettings.showCreateYourOwnButton);
        setShareTexts(sharePageSettings.texts);
        setUiLanguage(isUiLanguage(eventData.uiLanguage) ? eventData.uiLanguage : '');
        setShownLanguage(normalizeUiLanguage(eventData.journeyContext?.language ?? eventData.uiLanguage));
        setTourEnabled(eventData.tourEnabled === true);
        setCameraMode(isCameraMode(eventData.cameraMode) ? eventData.cameraMode : '');
        setShownCameraMode(isCameraMode(eventData.effectiveCameraMode) ? eventData.effectiveCameraMode : DEFAULT_CAMERA_MODE);
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
      emailFooterImageUrl: emailFooterImageUrl.trim() || null,
      showLogo: formData.get('showLogo') === 'on',
      // Only when the colours were touched: null clears them, so the event follows messmass (or the default of its partner) again.
      ...(coloursTouched ? { brandColor: ownColours ? brandColor || null : null, brandBorderColor: ownColours ? brandBorderColor || null : null } : {}),
      shortUrlSlug: (formData.get('shortUrlSlug') as string) ?? '',
      visualSettings: {
        buttonSize,
      },
      uiLanguage,
      cameraMode,
      tourEnabled,
      sharePage: {
        showCreateYourOwnButton,
        texts: shareTexts,
      },
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
      eyebrow="Events"
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
        <InlineAlert title="Error" message={error} severity="error" />
      ) : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <FormSection title="Partner" description="Partner cannot be changed after event creation.">
            <TextInput label="Partner (read-only)" value={event?.partnerName || ''} readOnly />
          </FormSection>

          <FormSection title="Event details">
            <Checkbox name="isActive" defaultChecked={event?.isActive} label="Event status" />
            <Text size="sm" c="dimmed" mt={-4}>
              Inactive events will not be available for frame selection.
            </Text>
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
              label="URL slug (optional)"
              defaultValue={event?.shortUrlSlug || ''}
              description={`Lowercase letters, digits, and hyphens (2–63 chars). When set, ${defaultGoShortOrigin()}/your-slug redirects to this event’s capture page.`}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
            />
          </FormSection>

          <FormSection title="Customization">
            <Select
              label="User interface language"
              description="The language of the default texts of the user journey, the photo page and the emails. Same as the partner follows the partner's default language. A text written for this event in the page editor still wins."
              data={[
                { value: '', label: uiLanguage === '' ? `Same as the partner (${UI_LANGUAGE_LABELS[shownLanguage]})` : 'Same as the partner' },
                ...UI_LANGUAGES.map((language) => ({ value: language, label: UI_LANGUAGE_LABELS[language] })),
              ]}
              value={uiLanguage}
              onChange={(value) => setUiLanguage(isUiLanguage(value) ? value : '')}
              allowDeselect={false}
            />

            <Select
              label="Camera"
              description="How the photo is taken. Same as the partner follows the partner's choice (automatic when it made none). Automatic opens the phone's own camera app on phones. The live camera with view buttons shows portrait or landscape, wide or tight; the other two live cameras differ in how the photo is taken."
              data={[
                { value: '', label: cameraMode === '' ? `Same as the partner (${CAMERA_MODE_LABELS[shownCameraMode]})` : 'Same as the partner' },
                ...CAMERA_MODES.map((mode) => ({ value: mode, label: CAMERA_MODE_LABELS[mode] })),
              ]}
              value={cameraMode}
              onChange={(value) => setCameraMode(isCameraMode(value) ? value : '')}
              allowDeselect={false}
            />

            <Checkbox
              checked={tourEnabled}
              onChange={(event) => setTourEnabled(event.currentTarget.checked)}
              label="Show the guided tour"
              description="Off by default. When on, the capture flow shows short tips the first time a user reaches a step, and a Show tour link to replay them."
            />

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

            <ImagePicker
              label="Email footer picture"
              helper="Shown under the card of every guest email of this event (the club's footer strip). An https address, PNG, JPEG or WebP (email apps do not show SVG); 1120 px wide is sharp on phones, it is shown 560 px wide."
              value={emailFooterImageUrl}
              onChange={setEmailFooterImageUrl}
              level={{ scope: 'event', eventId: mongoId }}
              fileTypes={EMAIL_PICTURE_TYPES}
              fileTypeWords={EMAIL_PICTURE_WORDS}
            />

            <Text fw={600} size="sm">
              Brand colors
            </Text>
            <Text size="xs" c="dimmed">
              Used across the event experience: buttons, inputs, checkboxes, and the camera interface.
            </Text>
            <Checkbox
              checked={!ownColours}
              onChange={(changed) => {
                setOwnColours(!changed.currentTarget.checked);
                setColoursTouched(true);
              }}
              label="Use the colours of the messmass style"
              description="On by default: the colours come from the style of this event's report in messmass. Switch it off to set your own colours for this event. The colours of the Start button on the welcome page, when it sets any, come first."
            />
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <ColorInput
                  label="Primary color"
                  value={brandColor}
                  onChange={(value) => {
                    setBrandColor(value);
                    setColoursTouched(true);
                  }}
                  disabled={!ownColours}
                  description="Buttons, capture fill, and focus states."
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <ColorInput
                  label="Border / accent color"
                  value={brandBorderColor}
                  onChange={(value) => {
                    setBrandBorderColor(value);
                    setColoursTouched(true);
                  }}
                  disabled={!ownColours}
                  description="Input borders, checkboxes, and capture button border."
                />
              </Grid.Col>
            </Grid>
          </FormSection>

          <FormSection
            title="Emails"
            description="The e-mails the users get (welcome, arrived, approved, declined, follow up), their texts, the legal part and the sender have their own page."
          >
            <Link href={`/admin/events/${mongoId}/emails`}>Open the Emails page of this event</Link>
          </FormSection>

          <FormSection
            title="Public result page"
            description="The shareable photo page linked from email and share actions."
          >
            <Checkbox
              checked={showCreateYourOwnButton}
              onChange={(event) => setShowCreateYourOwnButton(event.currentTarget.checked)}
              label="Show Create Your Own button"
              description="Display a CTA on the shared photo page that returns users to capture and start a new photo."
            />
            <Text size="sm" c="dimmed">
              The fixed words of the shareable photo page and of its waiting and not-approved notices. Leave a field empty to keep the text in grey.
            </Text>
            {SHARE_TEXT_FIELDS.map(({ key, label, long }) =>
              long ? (
                <Textarea
                  key={key}
                  label={label}
                  value={shareTexts[key] ?? ''}
                  onChange={(event) => setShareTexts((current) => ({ ...current, [key]: event.currentTarget.value }))}
                  placeholder={SHARE_PAGE_TEXT_DEFAULTS[key]}
                  autosize
                  minRows={2}
                  maxLength={500}
                />
              ) : (
                <TextInput
                  key={key}
                  label={label}
                  value={shareTexts[key] ?? ''}
                  onChange={(event) => setShareTexts((current) => ({ ...current, [key]: event.currentTarget.value }))}
                  placeholder={SHARE_PAGE_TEXT_DEFAULTS[key]}
                  maxLength={500}
                />
              )
            )}
          </FormSection>

          <Group>
            <Button type="submit" loading={isSubmitting || isUploadingLogo}>
              {isUploadingLogo ? 'Uploading logo…' : isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
            <Button component={Link} href={`/admin/events/${mongoId}`} variant="default">
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>

      <Text size="sm" c="dimmed" mt="xl" mb="xs">
        Event Pages below save separately from the fields above — its own &quot;Save Pages&quot; button, not
        &quot;Save changes&quot;. Save both sections if you&apos;ve edited both.
      </Text>
      <CustomPagesManager
        key={customPages.length}
        eventId={mongoId}
        initialPages={customPages}
        journeyContext={event?.journeyContext}
        acceptanceOnWhoAreYou={event?.acceptanceOnWhoAreYou === true}
        galleryConsent={typeof event?.galleryConsent === 'boolean' ? event.galleryConsent : null}
        effectiveGalleryConsent={event?.effectiveGalleryConsent === true}
        onSave={async (pages, options) => {
          try {
            const response = await fetch(`/api/events/${mongoId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customPages: pages, acceptanceOnWhoAreYou: options.acceptanceOnWhoAreYou, galleryConsent: options.galleryConsent, ...(options.defaultPageOrders ? { defaultPageOrders: options.defaultPageOrders } : {}) }),
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

            notifySuccess({ title: 'Pages saved', message: 'Custom page flow updated successfully.' });
          } catch (err: unknown) {
            throw new Error(getErrorMessage(err));
          }
        }}
      />
    </EditorScaffold>
  );
}
