/**
 * Edit Event Page
 *
 * Form to edit event details and manage custom page flows.
 */

'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
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
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconAlertCircle, IconX } from '@tabler/icons-react';
import { notifications } from '@/lib/gds/notifications';
import { type CustomPage } from '@/lib/db/schemas';
import CustomPagesManager from '@/components/admin/CustomPagesManager';
import { defaultGoShortOrigin } from '@/lib/site-hosts';
import { FormSection } from '@doneisbetter/gds-admin/client';
import { StateBlock } from '@doneisbetter/gds-core/client';
import EditorScaffold from '@/components/gds/EditorScaffold';
import type { TryOnSetup } from '@/lib/db/schemas';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';
import type { TryOnSuitOption } from '@/lib/tryon/suits';
import type { EventTryOnResultSlideshowMode } from '@/lib/tryon/slideshow-policy';
import {
  DEFAULT_EVENT_BUTTON_SIZE,
  EVENT_BUTTON_SIZE_OPTIONS,
  normalizeEventButtonSize,
  type EventButtonSize,
} from '@/lib/events/visual-settings';
import {
  DEFAULT_EVENT_SHARE_PAGE_SETTINGS,
  normalizeEventSharePageSettings,
} from '@/lib/events/share-page-settings';
import {
  DEFAULT_SUBMISSION_EMAIL_BODY,
  DEFAULT_SUBMISSION_EMAIL_SUBJECT,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT,
  SUBMISSION_EMAIL_TEMPLATE_HELP,
} from '@/lib/email/submission-template-defaults';

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
  tryOn?: {
    enabled?: boolean;
    setupId?: string | null;
    allowedLeatherSuitIds?: string[];
    applyFrameToReturnedResults?: boolean;
    vettingEnabled?: boolean;
    includeApprovedResultsInSlideshows?: boolean;
    resultSlideshowMode?: EventTryOnResultSlideshowMode;
  };
  notifications?: {
    submissionResultEmailEnabled?: boolean;
    submissionResultEmailSendAfterSave?: boolean;
    submissionResultEmailSendAfterRelatedPhotosReady?: boolean;
    submissionResultEmailSendAfterTryOnResubmissionApproved?: boolean;
    submissionResultEmailSubject?: string | null;
    submissionResultEmailBody?: string | null;
    submissionResultEmailSubjectAfterSave?: string | null;
    submissionResultEmailBodyAfterSave?: string | null;
    submissionResultEmailSubjectAfterRelatedPhotosReady?: string | null;
    submissionResultEmailBodyAfterRelatedPhotosReady?: string | null;
    submissionResultEmailSubjectAfterTryOnResubmissionApproved?: string | null;
    submissionResultEmailBodyAfterTryOnResubmissionApproved?: string | null;
  };
  visualSettings?: {
    buttonSize?: EventButtonSize;
  };
  sharePage?: {
    includeOriginalCapture?: boolean;
    includeCameraResult?: boolean;
    includeTryOnResult?: boolean;
    includeFramedTryOnResult?: boolean;
    includeCheckedInTryOnResult?: boolean;
    showCreateYourOwnButton?: boolean;
    pendingTryOnMessage?: string | null;
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
  const searchParams = useSearchParams();
  const [mongoId, setMongoId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [brandColor, setBrandColor] = useState(CAMERA_DEFAULT_BRAND_COLOR);
  const [brandBorderColor, setBrandBorderColor] = useState(CAMERA_DEFAULT_BRAND_BORDER_COLOR);
  const [customPages, setCustomPages] = useState<CustomPage[]>([]);
  const [tryOnEnabled, setTryOnEnabled] = useState(false);
  const [tryOnSetupId, setTryOnSetupId] = useState('');
  const [tryOnSetups, setTryOnSetups] = useState<TryOnSetup[]>([]);
  const [submissionResultEmailSendAfterSave, setSubmissionResultEmailSendAfterSave] = useState(true);
  const [submissionResultEmailSendAfterRelatedPhotosReady, setSubmissionResultEmailSendAfterRelatedPhotosReady] =
    useState(false);
  const [
    submissionResultEmailSendAfterTryOnResubmissionApproved,
    setSubmissionResultEmailSendAfterTryOnResubmissionApproved,
  ] = useState(false);
  const [submissionResultEmailSubjectAfterSave, setSubmissionResultEmailSubjectAfterSave] = useState(
    DEFAULT_SUBMISSION_EMAIL_SUBJECT
  );
  const [submissionResultEmailBodyAfterSave, setSubmissionResultEmailBodyAfterSave] = useState(
    DEFAULT_SUBMISSION_EMAIL_BODY
  );
  const [submissionResultEmailSubjectAfterRelatedPhotosReady, setSubmissionResultEmailSubjectAfterRelatedPhotosReady] =
    useState(DEFAULT_SUBMISSION_EMAIL_SUBJECT);
  const [submissionResultEmailBodyAfterRelatedPhotosReady, setSubmissionResultEmailBodyAfterRelatedPhotosReady] =
    useState(DEFAULT_SUBMISSION_EMAIL_BODY);
  const [
    submissionResultEmailSubjectAfterTryOnResubmissionApproved,
    setSubmissionResultEmailSubjectAfterTryOnResubmissionApproved,
  ] = useState(DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT);
  const [
    submissionResultEmailBodyAfterTryOnResubmissionApproved,
    setSubmissionResultEmailBodyAfterTryOnResubmissionApproved,
  ] = useState(DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY);
  const [buttonSize, setButtonSize] = useState<EventButtonSize>(DEFAULT_EVENT_BUTTON_SIZE);
  const [includeOriginalCapture, setIncludeOriginalCapture] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.includeOriginalCapture
  );
  const [includeCameraResult, setIncludeCameraResult] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.includeCameraResult
  );
  const [includeTryOnResult, setIncludeTryOnResult] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.includeTryOnResult
  );
  const [includeFramedTryOnResult, setIncludeFramedTryOnResult] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.includeFramedTryOnResult
  );
  const [includeCheckedInTryOnResult, setIncludeCheckedInTryOnResult] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.includeCheckedInTryOnResult
  );
  const [showCreateYourOwnButton, setShowCreateYourOwnButton] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.showCreateYourOwnButton
  );
  const [pendingTryOnMessage, setPendingTryOnMessage] = useState(
    DEFAULT_EVENT_SHARE_PAGE_SETTINGS.pendingTryOnMessage
  );
  const [resultSlideshowMode, setResultSlideshowMode] =
    useState<EventTryOnResultSlideshowMode>('disabled');
  const [applyFrameToReturnedResults, setApplyFrameToReturnedResults] = useState(false);
  const [tryOnVettingEnabled, setTryOnVettingEnabled] = useState(true);
  const [suitOptions, setSuitOptions] = useState<TryOnSuitOption[]>([]);
  const [selectedSuitIds, setSelectedSuitIds] = useState<string[]>([]);
  const [isLoadingTryOnSetups, setIsLoadingTryOnSetups] = useState(true);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [isSavingTryOnSetup, setIsSavingTryOnSetup] = useState(false);

  useEffect(() => {
    const rawCameraId = searchParams.get('cameraId') || searchParams.get('camera_id');
    setCameraId(rawCameraId && rawCameraId.trim().length > 0 ? rawCameraId.trim() : null);
  }, [searchParams]);

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
        setBrandColor(eventData.brandColor || CAMERA_DEFAULT_BRAND_COLOR);
        setBrandBorderColor(eventData.brandBorderColor || CAMERA_DEFAULT_BRAND_BORDER_COLOR);
        setTryOnEnabled(Boolean(eventData.tryOn?.enabled));
        setTryOnSetupId(eventData.tryOn?.setupId || '');
        setApplyFrameToReturnedResults(Boolean(eventData.tryOn?.applyFrameToReturnedResults));
        setTryOnVettingEnabled(eventData.tryOn?.vettingEnabled !== false);
        const emailModuleSettings = eventData.notifications;
        const emailSendAfterSave = emailModuleSettings?.submissionResultEmailSendAfterSave;
        const emailSendAfterRelatedPhotos = Boolean(
          emailModuleSettings?.submissionResultEmailSendAfterRelatedPhotosReady
        );
        const emailSendAfterTryOnResubmissionApproved = Boolean(
          emailModuleSettings?.submissionResultEmailSendAfterTryOnResubmissionApproved
        );
        const emailModuleEnabled = Boolean(emailModuleSettings?.submissionResultEmailEnabled);
        const hasEmailSendAfterSaveSetting =
          typeof emailModuleSettings?.submissionResultEmailSendAfterSave === 'boolean';
        const hasEmailSendAfterRelatedSetting =
          typeof emailModuleSettings?.submissionResultEmailSendAfterRelatedPhotosReady === 'boolean';
        const hasEmailSendAfterTryOnResubmissionSetting =
          typeof emailModuleSettings?.submissionResultEmailSendAfterTryOnResubmissionApproved === 'boolean';
        setSubmissionResultEmailSendAfterSave(
          emailSendAfterSave ??
            (emailModuleEnabled &&
            !hasEmailSendAfterSaveSetting &&
            !hasEmailSendAfterRelatedSetting &&
            !hasEmailSendAfterTryOnResubmissionSetting)
        );
        setSubmissionResultEmailSendAfterRelatedPhotosReady(emailSendAfterRelatedPhotos);
        setSubmissionResultEmailSendAfterTryOnResubmissionApproved(
          emailSendAfterTryOnResubmissionApproved
        );
        const legacySubject = eventData.notifications?.submissionResultEmailSubject;
        const legacyBody = eventData.notifications?.submissionResultEmailBody;
        setSubmissionResultEmailSubjectAfterSave(
          eventData.notifications?.submissionResultEmailSubjectAfterSave ||
            legacySubject ||
            DEFAULT_SUBMISSION_EMAIL_SUBJECT
        );
        setSubmissionResultEmailBodyAfterSave(
          eventData.notifications?.submissionResultEmailBodyAfterSave ||
            legacyBody ||
            DEFAULT_SUBMISSION_EMAIL_BODY
        );
        setSubmissionResultEmailSubjectAfterRelatedPhotosReady(
          eventData.notifications?.submissionResultEmailSubjectAfterRelatedPhotosReady ||
            legacySubject ||
            DEFAULT_SUBMISSION_EMAIL_SUBJECT
        );
        setSubmissionResultEmailBodyAfterRelatedPhotosReady(
          eventData.notifications?.submissionResultEmailBodyAfterRelatedPhotosReady ||
            legacyBody ||
            DEFAULT_SUBMISSION_EMAIL_BODY
        );
        setSubmissionResultEmailSubjectAfterTryOnResubmissionApproved(
          eventData.notifications?.submissionResultEmailSubjectAfterTryOnResubmissionApproved ||
            DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT
        );
        setSubmissionResultEmailBodyAfterTryOnResubmissionApproved(
          eventData.notifications?.submissionResultEmailBodyAfterTryOnResubmissionApproved ||
            DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY
        );
        setButtonSize(normalizeEventButtonSize(eventData.visualSettings?.buttonSize));
        const sharePageSettings = normalizeEventSharePageSettings(eventData.sharePage);
        setIncludeOriginalCapture(sharePageSettings.includeOriginalCapture);
        setIncludeCameraResult(sharePageSettings.includeCameraResult);
        setIncludeTryOnResult(sharePageSettings.includeTryOnResult);
        setIncludeFramedTryOnResult(sharePageSettings.includeFramedTryOnResult);
        setIncludeCheckedInTryOnResult(sharePageSettings.includeCheckedInTryOnResult);
        setShowCreateYourOwnButton(sharePageSettings.showCreateYourOwnButton);
        setPendingTryOnMessage(sharePageSettings.pendingTryOnMessage);
        setResultSlideshowMode(
          eventData.tryOn?.resultSlideshowMode ||
            (eventData.tryOn?.includeApprovedResultsInSlideshows ? 'mixed_with_originals' : 'disabled')
        );
        setSelectedSuitIds(
          Array.isArray(eventData.tryOn?.allowedLeatherSuitIds)
            ? eventData.tryOn.allowedLeatherSuitIds
            : []
        );
        setIsLoading(false);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
        setIsLoading(false);
      }
    };

    void fetchEvent();
  }, [mongoId]);

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

  useEffect(() => {
    const fetchTryOnSetups = async () => {
      setIsLoadingTryOnSetups(true);
      try {
        const query = cameraId ? `?cameraId=${encodeURIComponent(cameraId)}` : '';
        const response = await fetch(`/api/tryon/setups${query}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load try-on setups');
        }
        const setups = payload.data?.setups ?? payload.setups ?? [];
        setTryOnSetups(setups);
        const preferenceSetupId = typeof payload.data?.cameraPreference?.setupId === 'string'
          ? payload.data.cameraPreference.setupId.trim()
          : typeof payload.cameraPreference?.setupId === 'string'
            ? payload.cameraPreference.setupId.trim()
            : '';
        if (preferenceSetupId) {
          setTryOnSetupId(preferenceSetupId);
        }
      } catch {
        setTryOnSetups([]);
      } finally {
        setIsLoadingTryOnSetups(false);
      }
    };

    void fetchTryOnSetups();
  }, [cameraId]);

  const syncCameraTryOnSetup = async (setupId: string) => {
    if (!cameraId) {
      return;
    }

    const response = await fetch(
      `/api/tryon/setups/${encodeURIComponent(setupId)}/use`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to save try-on setup preference');
    }
  };

  const handleTryOnSetupChange = (value: string | null) => {
    const nextSetupId = value || '';
    const previousSetupId = tryOnSetupId;
    setTryOnSetupId(nextSetupId);
    if (!cameraId || !nextSetupId) {
      return;
    }
    setIsSavingTryOnSetup(true);
    void syncCameraTryOnSetup(nextSetupId)
      .catch(() => {
        setTryOnSetupId(previousSetupId);
        setError('Failed to save try-on setup preference for this camera.');
      })
      .finally(() => setIsSavingTryOnSetup(false));
  };

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

    const isEmailEnabled =
      submissionResultEmailSendAfterSave ||
      submissionResultEmailSendAfterRelatedPhotosReady ||
      submissionResultEmailSendAfterTryOnResubmissionApproved;

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
      tryOn: {
        enabled: tryOnEnabled,
        setupId: cameraId ? null : (tryOnSetupId || null),
        allowedLeatherSuitIds: selectedSuitIds,
        applyFrameToReturnedResults,
        vettingEnabled: tryOnVettingEnabled,
        includeApprovedResultsInSlideshows: resultSlideshowMode !== 'disabled',
        resultSlideshowMode,
      },
      notifications: {
        submissionResultEmailEnabled: isEmailEnabled,
        submissionResultEmailSendAfterSave,
        submissionResultEmailSendAfterRelatedPhotosReady,
        submissionResultEmailSendAfterTryOnResubmissionApproved,
        submissionResultEmailSubject: submissionResultEmailSubjectAfterSave,
        submissionResultEmailBody: submissionResultEmailBodyAfterSave,
        submissionResultEmailSubjectAfterSave,
        submissionResultEmailBodyAfterSave,
        submissionResultEmailSubjectAfterRelatedPhotosReady,
        submissionResultEmailBodyAfterRelatedPhotosReady,
        submissionResultEmailSubjectAfterTryOnResubmissionApproved,
        submissionResultEmailBodyAfterTryOnResubmissionApproved,
      },
      visualSettings: {
        buttonSize,
      },
      sharePage: {
        includeOriginalCapture,
        includeCameraResult,
        includeTryOnResult,
        includeFramedTryOnResult,
        includeCheckedInTryOnResult,
        showCreateYourOwnButton,
        pendingTryOnMessage,
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
        <Alert icon={<IconAlertCircle size={16} />}>
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
              label="Short link slug (optional)"
              defaultValue={event?.shortUrlSlug || ''}
              description={`Lowercase letters, digits, and hyphens (2–63 chars). When set, ${defaultGoShortOrigin()}/your-slug redirects to this event’s capture page.`}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
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

          <FormSection
            title="Email module"
            description="Optional email module. It does not add a visible page to the capture flow; it sends after a submission is saved."
          >
            <Checkbox
              checked={submissionResultEmailSendAfterSave}
              onChange={(event) => setSubmissionResultEmailSendAfterSave(event.currentTarget.checked)}
              label="Send email immediately after save"
            />
            <TextInput
              label="Email subject after save"
              value={submissionResultEmailSubjectAfterSave}
              onChange={(event) => setSubmissionResultEmailSubjectAfterSave(event.currentTarget.value)}
              disabled={!submissionResultEmailSendAfterSave}
              description={SUBMISSION_EMAIL_TEMPLATE_HELP}
            />
            <Textarea
              label="Email body after save"
              value={submissionResultEmailBodyAfterSave}
              onChange={(event) => setSubmissionResultEmailBodyAfterSave(event.currentTarget.value)}
              disabled={!submissionResultEmailSendAfterSave}
              autosize
              minRows={6}
              description="Plain text only. Include {link} where the result page URL should appear."
            />
            <Checkbox
              checked={submissionResultEmailSendAfterRelatedPhotosReady}
              onChange={(event) =>
                setSubmissionResultEmailSendAfterRelatedPhotosReady(event.currentTarget.checked)
              }
              label="Send email when related photos are ready"
              description="Useful for send-at-the-end behavior after approved try-on photos are available."
            />
            <TextInput
              label="Email subject when related photos are ready"
              value={submissionResultEmailSubjectAfterRelatedPhotosReady}
              onChange={(event) =>
                setSubmissionResultEmailSubjectAfterRelatedPhotosReady(event.currentTarget.value)
              }
              disabled={!submissionResultEmailSendAfterRelatedPhotosReady}
              description={SUBMISSION_EMAIL_TEMPLATE_HELP}
            />
            <Textarea
              label="Email body when related photos are ready"
              value={submissionResultEmailBodyAfterRelatedPhotosReady}
              onChange={(event) =>
                setSubmissionResultEmailBodyAfterRelatedPhotosReady(event.currentTarget.value)
              }
              disabled={!submissionResultEmailSendAfterRelatedPhotosReady}
              autosize
              minRows={6}
              description="Plain text only. Include {link} where the result page URL should appear."
            />
            <Checkbox
              checked={submissionResultEmailSendAfterTryOnResubmissionApproved}
              onChange={(event) =>
                setSubmissionResultEmailSendAfterTryOnResubmissionApproved(event.currentTarget.checked)
              }
              label="Send update email after approved resubmitted try-on result"
              description="Sends only when an admin resubmits a try-on job and later approves the new result."
            />
            <TextInput
              label="Email subject after approved resubmission"
              value={submissionResultEmailSubjectAfterTryOnResubmissionApproved}
              onChange={(event) =>
                setSubmissionResultEmailSubjectAfterTryOnResubmissionApproved(event.currentTarget.value)
              }
              disabled={!submissionResultEmailSendAfterTryOnResubmissionApproved}
              description={SUBMISSION_EMAIL_TEMPLATE_HELP}
            />
            <Textarea
              label="Email body after approved resubmission"
              value={submissionResultEmailBodyAfterTryOnResubmissionApproved}
              onChange={(event) =>
                setSubmissionResultEmailBodyAfterTryOnResubmissionApproved(event.currentTarget.value)
              }
              disabled={!submissionResultEmailSendAfterTryOnResubmissionApproved}
              autosize
              minRows={6}
              description="Plain text only. Include {link} where the updated result page URL should appear."
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
              checked={includeTryOnResult}
              onChange={(event) => setIncludeTryOnResult(event.currentTarget.checked)}
              label="Show try-on photo generated by the worker"
              description="Available after try-on finishes and is approved or auto-approved."
            />
            <Checkbox
              checked={includeFramedTryOnResult}
              onChange={(event) => setIncludeFramedTryOnResult(event.currentTarget.checked)}
              label="Show try-on photo with Camera frame"
              description="Available when returned try-on results are framed by Camera."
            />
            <Checkbox
              checked={includeCheckedInTryOnResult}
              onChange={(event) => setIncludeCheckedInTryOnResult(event.currentTarget.checked)}
              label="Show checked-in try-on photo"
              description="Display the checked-in try-on result when available for this submission."
            />
            <Checkbox
              checked={showCreateYourOwnButton}
              onChange={(event) => setShowCreateYourOwnButton(event.currentTarget.checked)}
              label="Show Create Your Own button"
              description="Display a CTA on the shared photo page that returns users to capture and start a new photo."
            />
            <Textarea
              label="Pending try-on message"
              value={pendingTryOnMessage}
              onChange={(event) => setPendingTryOnMessage(event.currentTarget.value)}
              autosize
              minRows={2}
              description="Shown on the shareable result page when a try-on was requested but no approved result is available yet."
            />
          </FormSection>

          <FormSection
            title="Try-on"
            description="Enable the local AI leather pipeline for this event and optionally limit the available jersey catalog."
          >
            <Group justify="flex-end">
              <Anchor component={Link} href="/admin/tryon/suits" size="sm">
                Manage leather jerseys
              </Anchor>
            </Group>
            <Checkbox
              checked={tryOnEnabled}
              onChange={(nextEvent) => {
                const checked = nextEvent.currentTarget.checked;
                setTryOnEnabled(checked);
                if (!checked) {
                  setResultSlideshowMode('disabled');
                  setApplyFrameToReturnedResults(false);
                  setTryOnVettingEnabled(true);
                  setTryOnSetupId('');
                }
              }}
              label="Enable local AI leather try-on for this event"
            />
            <Select
              label="Try-on setup profile"
              description={
                cameraId
                  ? 'Select the setup used by this camera. If no camera preference is set here, worker resolution uses global default.'
                  : 'Select which model/profile config is used for this event. Leave empty to use global default.'
              }
              placeholder={
                isLoadingTryOnSetups
                  ? 'Loading try-on setups...'
                  : tryOnSetups.length > 0
                    ? 'Use global default'
                    : 'No active try-on setups found'
              }
              data={tryOnSetups.map((setup) => ({
                value: setup.setupId,
                label: `${setup.name}${setup.isDefault ? ' (global default)' : ''}`,
              }))}
              value={tryOnSetupId || null}
              disabled={!tryOnEnabled || isLoadingTryOnSetups || isSavingTryOnSetup}
              onChange={(value) => handleTryOnSetupChange(value)}
            />
            {tryOnSetups.length === 1 && !cameraId ? (
              <Alert color="yellow" variant="light">
                Only one active try-on setup profile is available. Add additional profiles to the
                MongoDB `tryon_setups` collection to expose more options.
              </Alert>
            ) : tryOnSetups.length === 0 ? (
              <Alert color="red" variant="light">
                No active try-on setup profiles found. Use the seed/import workflow to populate
                `tryon_setups` first.
              </Alert>
            ) : null}
            <Checkbox
              checked={tryOnVettingEnabled}
              onChange={(nextEvent) => setTryOnVettingEnabled(nextEvent.currentTarget.checked)}
              disabled={!tryOnEnabled}
              label="Require admin vetting before publishing try-on results"
              description="When disabled, completed try-on results are approved automatically and become visible on the user's result page."
            />
            <Checkbox
              checked={applyFrameToReturnedResults}
              onChange={(nextEvent) => setApplyFrameToReturnedResults(nextEvent.currentTarget.checked)}
              disabled={!tryOnEnabled}
              label="Apply the selected Camera frame to returned try-on results"
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
