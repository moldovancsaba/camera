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
import type { TryOnSetup } from '@/lib/db/schemas';
import type { EventTryOnResultSlideshowMode } from '@/lib/tryon/slideshow-policy';
import {
  DEFAULT_EVENT_BUTTON_SIZE,
  EVENT_BUTTON_SIZE_OPTIONS,
  type EventButtonSize,
} from '@/lib/events/visual-settings';
import {
  DEFAULT_EVENT_SHARE_PAGE_SETTINGS,
} from '@/lib/events/share-page-settings';
import {
  DEFAULT_SUBMISSION_EMAIL_BODY,
  DEFAULT_SUBMISSION_EMAIL_SUBJECT,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT,
  SUBMISSION_EMAIL_TEMPLATE_HELP,
} from '@/lib/email/submission-template-defaults';

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
  const [tryOnSetups, setTryOnSetups] = useState<TryOnSetup[]>([]);
  const [tryOnSetupId, setTryOnSetupId] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [tryOnEnabled, setTryOnEnabled] = useState(false);
  const [submissionResultEmailEnabled, setSubmissionResultEmailEnabled] = useState(false);
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
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [isLoadingTryOnSetups, setIsLoadingTryOnSetups] = useState(true);
  const [isSavingTryOnSetup, setIsSavingTryOnSetup] = useState(false);

  useEffect(() => {
    const rawCameraId = searchParams.get('cameraId') || searchParams.get('camera_id');
    setCameraId(rawCameraId && rawCameraId.trim().length > 0 ? rawCameraId.trim() : null);
  }, [searchParams]);

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
    setTryOnSetupId(nextSetupId);
    if (!cameraId || !nextSetupId) {
      return;
    }
    if (!isLoadingTryOnSetups) {
      setIsSavingTryOnSetup(true);
      void syncCameraTryOnSetup(nextSetupId)
        .catch((error) => {
          setError(error instanceof Error ? error.message : 'Failed to save try-on setup preference');
        })
        .finally(() => setIsSavingTryOnSetup(false));
    }
  };

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
        setupId: cameraId ? null : (tryOnSetupId || null),
        allowedLeatherSuitIds: selectedSuitIds,
        applyFrameToReturnedResults,
        vettingEnabled: tryOnVettingEnabled,
        includeApprovedResultsInSlideshows: resultSlideshowMode !== 'disabled',
        resultSlideshowMode,
      },
      notifications: {
        submissionResultEmailEnabled,
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
        <Alert icon={<IconAlertCircle size={16} />}>
          <Text fw={700}>Error</Text>
          <Text size="sm">{error}</Text>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <FormSection title="Partner" description="The partner workspace this event app instance belongs to.">
            {partners.length === 0 ? (
              <Alert>
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
            <Select
              label="Button size"
              description="Controls the primary action button size across this event app."
              data={EVENT_BUTTON_SIZE_OPTIONS}
              value={buttonSize}
              onChange={(value) => setButtonSize((value as EventButtonSize) || DEFAULT_EVENT_BUTTON_SIZE)}
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
            title="Email module"
            description="Optional email module. It does not add a visible page to the capture flow; it sends after a submission is saved."
          >
            <Checkbox
              checked={submissionResultEmailEnabled}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setSubmissionResultEmailEnabled(checked);
                if (
                  checked &&
                  !submissionResultEmailSendAfterSave &&
                  !submissionResultEmailSendAfterRelatedPhotosReady &&
                  !submissionResultEmailSendAfterTryOnResubmissionApproved
                ) {
                  setSubmissionResultEmailSendAfterSave(true);
                }
              }}
              label="Email the user's result page link after save"
              description="Requires a collected or authenticated email address. This is independent from the capture flow share-options screen."
            />
            <Checkbox
              checked={submissionResultEmailSendAfterSave}
              onChange={(event) => setSubmissionResultEmailSendAfterSave(event.currentTarget.checked)}
              disabled={!submissionResultEmailEnabled}
              label="Send email immediately after save"
            />
            <TextInput
              label="Email subject after save"
              value={submissionResultEmailSubjectAfterSave}
              onChange={(event) => setSubmissionResultEmailSubjectAfterSave(event.currentTarget.value)}
              disabled={!submissionResultEmailEnabled || !submissionResultEmailSendAfterSave}
              description={SUBMISSION_EMAIL_TEMPLATE_HELP}
            />
            <Textarea
              label="Email body after save"
              value={submissionResultEmailBodyAfterSave}
              onChange={(event) => setSubmissionResultEmailBodyAfterSave(event.currentTarget.value)}
              disabled={!submissionResultEmailEnabled || !submissionResultEmailSendAfterSave}
              autosize
              minRows={6}
              description="Plain text only. Include {link} where the result page URL should appear."
            />
            <Checkbox
              checked={submissionResultEmailSendAfterRelatedPhotosReady}
              onChange={(event) =>
                setSubmissionResultEmailSendAfterRelatedPhotosReady(event.currentTarget.checked)
              }
              disabled={!submissionResultEmailEnabled}
              label="Send email when related photos are ready"
              description="Useful for send-at-the-end behavior after approved try-on photos are available."
            />
            <TextInput
              label="Email subject when related photos are ready"
              value={submissionResultEmailSubjectAfterRelatedPhotosReady}
              onChange={(event) =>
                setSubmissionResultEmailSubjectAfterRelatedPhotosReady(event.currentTarget.value)
              }
              disabled={!submissionResultEmailEnabled || !submissionResultEmailSendAfterRelatedPhotosReady}
              description={SUBMISSION_EMAIL_TEMPLATE_HELP}
            />
            <Textarea
              label="Email body when related photos are ready"
              value={submissionResultEmailBodyAfterRelatedPhotosReady}
              onChange={(event) =>
                setSubmissionResultEmailBodyAfterRelatedPhotosReady(event.currentTarget.value)
              }
              disabled={!submissionResultEmailEnabled || !submissionResultEmailSendAfterRelatedPhotosReady}
              autosize
              minRows={6}
              description="Plain text only. Include {link} where the result page URL should appear."
            />
            <Checkbox
              checked={submissionResultEmailSendAfterTryOnResubmissionApproved}
              onChange={(event) =>
                setSubmissionResultEmailSendAfterTryOnResubmissionApproved(event.currentTarget.checked)
              }
              disabled={!submissionResultEmailEnabled}
              label="Send update email after approved resubmitted try-on result"
              description="Sends only when an admin resubmits a try-on job and later approves the new result."
            />
            <TextInput
              label="Email subject after approved resubmission"
              value={submissionResultEmailSubjectAfterTryOnResubmissionApproved}
              onChange={(event) =>
                setSubmissionResultEmailSubjectAfterTryOnResubmissionApproved(event.currentTarget.value)
              }
              disabled={!submissionResultEmailEnabled || !submissionResultEmailSendAfterTryOnResubmissionApproved}
              description={SUBMISSION_EMAIL_TEMPLATE_HELP}
            />
            <Textarea
              label="Email body after approved resubmission"
              value={submissionResultEmailBodyAfterTryOnResubmissionApproved}
              onChange={(event) =>
                setSubmissionResultEmailBodyAfterTryOnResubmissionApproved(event.currentTarget.value)
              }
              disabled={!submissionResultEmailEnabled || !submissionResultEmailSendAfterTryOnResubmissionApproved}
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
                  setApplyFrameToReturnedResults(false);
                  setTryOnVettingEnabled(true);
                  setTryOnSetupId('');
                }
              }}
              label="Enable local AI leather try-on for this event"
            />
            <Checkbox
              checked={tryOnVettingEnabled}
              onChange={(event) => setTryOnVettingEnabled(event.currentTarget.checked)}
              disabled={!tryOnEnabled}
              label="Require admin vetting before publishing try-on results"
              description="When disabled, completed try-on results are approved automatically and become visible on the user's result page."
            />
            <Checkbox
              checked={applyFrameToReturnedResults}
              onChange={(event) => setApplyFrameToReturnedResults(event.currentTarget.checked)}
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
              label="Try-on setup profile"
              description={
                cameraId
                  ? 'Select the setup for this camera. If no camera preference is selected here, worker will use default.'
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
              onChange={(value) => handleTryOnSetupChange(value)}
              disabled={!tryOnEnabled || isLoadingTryOnSetups || isSavingTryOnSetup}
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
