/**
 * Custom Pages Manager Component
 * 
 * Manages custom page flows for events (onboarding and thank you pages)
 * Includes add/edit/delete/reorder functionality
 * 
 * Why separate component:
 * - Keeps event edit page manageable
 * - Encapsulates page management logic
 * - Reusable across admin interfaces
 */

'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { CustomPageType, type CustomPage, generateId, generateTimestamp } from '@/lib/db/schemas';

export interface CustomPagesManagerProps {
  eventId: string;
  initialPages: CustomPage[];
  onSave: (pages: CustomPage[]) => Promise<void>;
}

export default function CustomPagesManager({ eventId, initialPages, onSave }: CustomPagesManagerProps) {
  const [pages, setPages] = useState<CustomPage[]>(initialPages);
  const [showModal, setShowModal] = useState(false);
  const [editingPage, setEditingPage] = useState<CustomPage | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Debug logging
  console.log('CustomPagesManager render:', { 
    eventId, 
    initialPagesCount: initialPages.length, 
    pagesCount: pages.length,
    pages 
  });

  /**
   * Add [Take Photo] placeholder if not present
   * This represents the capture step and is ALWAYS FIRST in ordering (order: 0)
   * 
   * Design: [Take Photo] starts the playlist by design
   * - Onboarding pages get negative orders (-3, -2, -1)
   * - [Take Photo] is always order 0
   * - Thank you pages get positive orders (1, 2, 3)
   */
  const ensureTakePhotoPlaceholder = (pageList: CustomPage[]): CustomPage[] => {
    const hasTakePhoto = pageList.some(p => p.pageType === CustomPageType.TAKE_PHOTO);
    if (!hasTakePhoto) {
      const now = generateTimestamp();
      // [Take Photo] always at order 0, shift existing pages
      const adjustedPages = pageList.map(p => ({
        ...p,
        order: p.order >= 0 ? p.order + 1 : p.order  // Shift positive orders up
      }));
      
      return [
        {
          pageId: generateId(),
          pageType: CustomPageType.TAKE_PHOTO,
          order: 0,  // Always first
          isActive: true,
          config: {
            title: '[Take Photo]',
            description: '',
            buttonText: '',
          },
          createdAt: now,
          updatedAt: now,
        },
        ...adjustedPages,
      ];
    }
    return pageList;
  };

  // Get pages sorted by order, with [Take Photo] placeholder always first
  const pagesWithPlaceholder = ensureTakePhotoPlaceholder(pages);
  const sortedPages = [...pagesWithPlaceholder].sort((a, b) => a.order - b.order);

  /**
   * Open modal to add new page
   * 
   * New pages start at order 1 (after [Take Photo] at order 0)
   * User can then reorder to move before (negative) or after (positive) [Take Photo]
   */
  const handleAddPage = (type: CustomPageType) => {
    if (type === CustomPageType.TAKE_PHOTO) return; // Can't manually add

    const now = generateTimestamp();
    // Find the highest order to add at the end
    const maxOrder = pages.length > 0 ? Math.max(...pages.map(p => p.order)) : 0;
    
    const defaultTitle =
      type === CustomPageType.WHO_ARE_YOU
        ? 'Who are you?'
        : type === CustomPageType.ACCEPT
          ? 'Please accept'
          : type === CustomPageType.RESTART
            ? 'Ready for the next guest?'
          : 'Next step';

    const newPage: CustomPage = {
      pageId: generateId(),
      pageType: type,
      order: maxOrder + 1,  // Add at end
      isActive: true,
      config: {
        title: defaultTitle,
        description: '',
        buttonText: 'Next',
        ...(type === CustomPageType.WHO_ARE_YOU && {
          nameLabel: 'Your Name',
          emailLabel: 'Your Email',
        }),
        ...(type === CustomPageType.ACCEPT && {
          checkboxText: 'I have read and agree to the terms above.',
        }),
        ...(type === CustomPageType.CTA && {
          checkboxText: '',
        }),
        ...(type === CustomPageType.RESTART && {
          buttonText: 'Start again',
          restartButtonText: 'Start again',
        }),
      },
      createdAt: now,
      updatedAt: now,
    };

    setEditingPage(newPage);
    setShowModal(true);
  };

  /**
   * Open modal to edit existing page
   */
  const handleEditPage = (page: CustomPage) => {
    setEditingPage(page);
    setShowModal(true);
  };

  /**
   * Save page (add or update)
   */
  const handleSavePage = (page: CustomPage) => {
    const existingIndex = pages.findIndex(p => p.pageId === page.pageId);
    
    if (existingIndex >= 0) {
      // Update existing
      const updated = [...pages];
      updated[existingIndex] = { ...page, updatedAt: generateTimestamp() };
      setPages(updated);
    } else {
      // Add new
      setPages([...pages, page]);
    }

    setShowModal(false);
    setEditingPage(null);
  };

  /**
   * Delete page
   */
  const handleDeletePage = (pageId: string) => {
    if (!confirm('Delete this page? This cannot be undone.')) return;

    const filtered = pages.filter(p => p.pageId !== pageId);
    // Reorder remaining pages
    const reordered = filtered.map((p, index) => ({ ...p, order: index }));
    setPages(reordered);
  };

  /**
   * Move page up in order
   */
  const handleMoveUp = (pageId: string) => {
    const index = sortedPages.findIndex(p => p.pageId === pageId);
    if (index <= 0) return;

    const newPages = [...sortedPages];
    [newPages[index - 1], newPages[index]] = [newPages[index], newPages[index - 1]];
    
    // Update order values
    const reordered = newPages.map((p, i) => ({ ...p, order: i }));
    setPages(reordered);
  };

  /**
   * Move page down in order
   */
  const handleMoveDown = (pageId: string) => {
    const index = sortedPages.findIndex(p => p.pageId === pageId);
    if (index >= sortedPages.length - 1) return;

    const newPages = [...sortedPages];
    [newPages[index], newPages[index + 1]] = [newPages[index + 1], newPages[index]];
    
    // Update order values
    const reordered = newPages.map((p, i) => ({ ...p, order: i }));
    setPages(reordered);
  };

  /**
   * Save all pages to event
   */
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // Ensure [Take Photo] placeholder exists
      const pagesWithPlaceholder = ensureTakePhotoPlaceholder(pages);
      const pagesToSave = pagesWithPlaceholder.map((p) => ({
        ...p,
        order: typeof p.order === 'number' && Number.isFinite(p.order) ? p.order : Number(p.order),
      }));
      await onSave(pagesToSave);
    } catch (error) {
      console.error('Failed to save pages:', error);
      const msg = error instanceof Error ? error.message : 'Failed to save pages. Please try again.';
      alert(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card withBorder radius="lg" p="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={2}>Event Pages</Title>
            <Text size="sm" c="dimmed">
              Configure onboarding and thank you pages for this event
            </Text>
          </Stack>
          <Button
            type="button"
          onClick={handleSaveAll}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Pages'}
          </Button>
        </Group>

      {/* Page List */}
        <Stack gap="sm">
        {sortedPages.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
            No custom pages yet. Add pages to create onboarding or thank you flows.
            </Text>
        ) : (
          sortedPages.map((page, index) => (
              <Card
              key={page.pageId}
                withBorder
                radius="md"
                p="md"
            >
              {/* Order indicators */}
                <Group gap="md" align="center" wrap="nowrap">
                  <Stack gap={4}>
                    <Button
                      type="button"
                      variant="subtle"
                      size="compact-xs"
                  onClick={() => handleMoveUp(page.pageId)}
                  disabled={index === 0}
                  title="Move up"
                >
                  ▲
                    </Button>
                    <Button
                      type="button"
                      variant="subtle"
                      size="compact-xs"
                  onClick={() => handleMoveDown(page.pageId)}
                  disabled={index === sortedPages.length - 1}
                  title="Move down"
                >
                  ▼
                    </Button>
                  </Stack>

              {/* Page info */}
                  <Stack gap={4} style={{ flex: 1 }}>
                    <Group gap="xs">
                      <Text size="sm" ff="monospace" c="dimmed">
                    #{index + 1}
                      </Text>
                      <Badge variant="light">
                    {page.pageType}
                      </Badge>
                    </Group>
                    <Text size="sm" fw={600}>
                    {page.config.title || '[Untitled]'}
                    </Text>
                  </Stack>

              {/* Actions */}
                  <Group gap="xs">
                    <Button
                      type="button"
                      size="xs"
                      variant="light"
                  onClick={() => handleEditPage(page)}
                >
                  Edit
                    </Button>
                {page.pageType !== CustomPageType.TAKE_PHOTO && (
                      <Button
                        type="button"
                        size="xs"
                        variant="light"
                    onClick={() => handleDeletePage(page.pageId)}
                  >
                    Delete
                      </Button>
                )}
                  </Group>
                </Group>
              </Card>
          ))
        )}
        </Stack>

      {/* Add Page Buttons */}
        <Group gap="sm">
          <Button
            type="button"
            variant="light"
          onClick={() => handleAddPage(CustomPageType.WHO_ARE_YOU)}
        >
          + Who Are You
          </Button>
          <Button
            type="button"
            variant="light"
          onClick={() => handleAddPage(CustomPageType.ACCEPT)}
        >
          + Accept/Terms
          </Button>
          <Button
            type="button"
            variant="light"
          onClick={() => handleAddPage(CustomPageType.CTA)}
        >
          + CTA
          </Button>
          <Button
            type="button"
            variant="light"
          onClick={() => handleAddPage(CustomPageType.RESTART)}
        >
          + Restart
          </Button>
        </Group>

      {/* Edit Modal - Rendered via Portal to avoid nested form */}
        <Modal
          opened={showModal && editingPage !== null}
          onClose={() => {
            setShowModal(false);
            setEditingPage(null);
          }}
          title={editingPage ? `Edit ${editingPage.pageType} Page` : 'Edit Page'}
          size="lg"
          centered
        >
          {editingPage ? (
            <PageEditModal
              page={editingPage}
              onSave={handleSavePage}
              onCancel={() => {
                setShowModal(false);
                setEditingPage(null);
              }}
            />
          ) : null}
        </Modal>
      </Stack>
    </Card>
  );
}

/**
 * Modal for editing page configuration
 */
function PageEditModal({
  page,
  onSave,
  onCancel,
}: {
  page: CustomPage;
  onSave: (page: CustomPage) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(page.config.title);
  const [description, setDescription] = useState(page.config.description);
  const [buttonText, setButtonText] = useState(page.config.buttonText);
  // Who-are-you SSO options
  const [enableSSOLogin, setEnableSSOLogin] = useState(page.config.enableSSOLogin || false);
  const [enablePseudoReg, setEnablePseudoReg] = useState(page.config.enablePseudoReg !== false); // Default true
  const [ssoButtonText, setSsoButtonText] = useState(
    page.config.ssoButtonText || 'Sign in with Google or Facebook'
  );
  const [pseudoFormTitle, setPseudoFormTitle] = useState(page.config.pseudoFormTitle || '');
  const [nameLabel, setNameLabel] = useState(page.config.nameLabel || 'Your Name');
  const [emailLabel, setEmailLabel] = useState(page.config.emailLabel || 'Your Email');
  const [namePlaceholder, setNamePlaceholder] = useState(page.config.namePlaceholder || 'Enter your name');
  const [emailPlaceholder, setEmailPlaceholder] = useState(page.config.emailPlaceholder || 'your.email@example.com');
  const [checkboxText, setCheckboxText] = useState(page.config.checkboxText || '');
  // For CTA pages: hasButton determines if button is shown (if false, it's an end page)
  const [hasButton, setHasButton] = useState(page.config.hasButton !== false);
  const [visitButtonText, setVisitButtonText] = useState(page.config.visitButtonText || 'Visit Now');
  const [redirectingText, setRedirectingText] = useState(page.config.redirectingText || 'Redirecting you shortly...');
  // For take-photo page: button texts
  const [captureButtonText, setCaptureButtonText] = useState(page.config.captureButtonText || 'LOVE IT');
  const [retryButtonText, setRetryButtonText] = useState(page.config.retryButtonText || 'TRY AGAIN');
  const [shareNextButtonText, setShareNextButtonText] = useState(page.config.shareNextButtonText || 'NEXT');
  const [shareScreenTitle, setShareScreenTitle] = useState(
    page.config.shareScreenTitle || 'Share Your Photo'
  );
  const [shareCopyLinkButtonText, setShareCopyLinkButtonText] = useState(
    page.config.shareCopyLinkButtonText || 'Copy'
  );
  const [shareViewPhotoButtonText, setShareViewPhotoButtonText] = useState(
    page.config.shareViewPhotoButtonText || 'View your photo (opens share link)'
  );
  const [shareSuggestedMessageLabel, setShareSuggestedMessageLabel] = useState(
    page.config.shareSuggestedMessageLabel || 'Suggested message for apps below:'
  );
  const [shareSocialCaptionTemplate, setShareSocialCaptionTemplate] = useState(
    page.config.shareSocialCaptionTemplate || ''
  );
  const [changeButtonText, setChangeButtonText] = useState(page.config.changeButtonText || 'Change');
  const [successMessage, setSuccessMessage] = useState(page.config.successMessage || 'Photo saved successfully! You can now share it.');
  const [showSharePage, setShowSharePage] = useState(page.config.showSharePage !== false);
  const [skipShareMessage, setSkipShareMessage] = useState(page.config.skipShareMessage || 'Thank you! Your photo has been saved.');
  const [showFrameOnCapture, setShowFrameOnCapture] = useState(page.config.showFrameOnCapture !== false); // Default true
  // Camera prompt text
  const [cameraPromptTitle, setCameraPromptTitle] = useState(page.config.cameraPromptTitle || 'Ready to capture?');
  const [cameraPromptDescription, setCameraPromptDescription] = useState(page.config.cameraPromptDescription || 'Click to start your camera and take a photo');
  // Error and notification messages for take-photo
  const [errorFrameMessage, setErrorFrameMessage] = useState(page.config.errorFrameMessage || 'Failed to apply frame. Please try again.');
  const [errorSaveMessage, setErrorSaveMessage] = useState(page.config.errorSaveMessage || 'Failed to save photo: Please try again.');
  const [linkCopiedMessage, setLinkCopiedMessage] = useState(page.config.linkCopiedMessage || 'Link copied to clipboard!');
  const [copyErrorMessage, setCopyErrorMessage] = useState(page.config.copyErrorMessage || 'Failed to copy link. Please copy it manually.');
  const [saveFirstMessage, setSaveFirstMessage] = useState(page.config.saveFirstMessage || 'Please save the photo first to get a shareable link.');
  const [restartButtonText, setRestartButtonText] = useState(
    page.config.restartButtonText || page.config.buttonText || 'Start again'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const updated: CustomPage = {
      ...page,
      config: {
        title,
        description,
        buttonText,
        ...(page.pageType === CustomPageType.WHO_ARE_YOU && {
          enableSSOLogin,
          enablePseudoReg,
          ssoButtonText,
          pseudoFormTitle,
          nameLabel,
          emailLabel,
          namePlaceholder,
          emailPlaceholder,
        }),
        ...(page.pageType === CustomPageType.ACCEPT && {
          checkboxText,
        }),
        ...(page.pageType === CustomPageType.CTA && {
          checkboxText,
          hasButton,
          visitButtonText,
          redirectingText,
        }),
        ...(page.pageType === CustomPageType.TAKE_PHOTO && {
          captureButtonText,
          retryButtonText,
          shareNextButtonText,
          shareScreenTitle,
          shareCopyLinkButtonText,
          shareViewPhotoButtonText,
          shareSuggestedMessageLabel,
          shareSocialCaptionTemplate: shareSocialCaptionTemplate.trim() || undefined,
          changeButtonText,
          successMessage,
          showSharePage,
          skipShareMessage,
          showFrameOnCapture,
          cameraPromptTitle,
          cameraPromptDescription,
          errorFrameMessage,
          errorSaveMessage,
          linkCopiedMessage,
          copyErrorMessage,
          saveFirstMessage,
        }),
        ...(page.pageType === CustomPageType.RESTART && {
          restartButtonText,
        }),
      },
    };

    onSave(updated);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <TextInput
          label="Page Title"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          required
          placeholder="e.g., Welcome!"
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          rows={3}
          placeholder="Optional description text"
        />

        {page.pageType === CustomPageType.WHO_ARE_YOU ? (
          <>
            <Card withBorder radius="md" p="md">
              <Stack gap="md">
                <Title order={4}>Authentication Options</Title>
                <Checkbox
                  checked={enableSSOLogin}
                  onChange={(event) => setEnableSSOLogin(event.currentTarget.checked)}
                  label="Enable Google / Facebook login"
                  description="Shows Continue with Google and Continue with Facebook."
                />
                {enableSSOLogin ? (
                  <TextInput
                    label="Heading above social buttons"
                    value={ssoButtonText}
                    onChange={(event) => setSsoButtonText(event.currentTarget.value)}
                    placeholder="e.g., Sign in with Google or Facebook"
                  />
                ) : null}
                <Checkbox
                  checked={enablePseudoReg}
                  onChange={(event) => setEnablePseudoReg(event.currentTarget.checked)}
                  label="Enable pseudo registration"
                  description="Allow users to provide name and email without authentication."
                />
                {enablePseudoReg ? (
                  <TextInput
                    label="Form Title"
                    value={pseudoFormTitle}
                    onChange={(event) => setPseudoFormTitle(event.currentTarget.value)}
                    placeholder="e.g., Enter your details"
                  />
                ) : null}
                {!enableSSOLogin && !enablePseudoReg ? (
                  <Alert variant="light">
                    At least one authentication method must be enabled.
                  </Alert>
                ) : null}
              </Stack>
            </Card>

            {enablePseudoReg ? (
              <>
                <TextInput
                  label="Name Field Label"
                  value={nameLabel}
                  onChange={(event) => setNameLabel(event.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Name Field Placeholder"
                  value={namePlaceholder}
                  onChange={(event) => setNamePlaceholder(event.currentTarget.value)}
                  placeholder="e.g., Enter your name"
                />
                <TextInput
                  label="Email Field Label"
                  value={emailLabel}
                  onChange={(event) => setEmailLabel(event.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Email Field Placeholder"
                  value={emailPlaceholder}
                  onChange={(event) => setEmailPlaceholder(event.currentTarget.value)}
                  placeholder="e.g., your.email@example.com"
                />
              </>
            ) : null}
          </>
        ) : null}

        {page.pageType === CustomPageType.ACCEPT ? (
          <Textarea
            label="Checkbox Text"
            value={checkboxText}
            onChange={(event) => setCheckboxText(event.currentTarget.value)}
            required
            rows={2}
            placeholder="e.g., I agree to the terms and conditions"
          />
        ) : null}

        {page.pageType === CustomPageType.CTA ? (
          <>
            <TextInput
              type="url"
              label="URL to visit"
              value={checkboxText}
              onChange={(event) => setCheckboxText(event.currentTarget.value)}
              placeholder="e.g., https://example.com"
            />
            <TextInput
              label="Visit Button Text"
              value={visitButtonText}
              onChange={(event) => setVisitButtonText(event.currentTarget.value)}
              placeholder="e.g., Visit Now"
            />
            <TextInput
              label="Redirecting Message"
              value={redirectingText}
              onChange={(event) => setRedirectingText(event.currentTarget.value)}
              placeholder="e.g., Redirecting you shortly..."
            />
            <Checkbox
              checked={hasButton}
              onChange={(event) => setHasButton(event.currentTarget.checked)}
              label="Show Continue Button"
              description="If unchecked, this will be the final page in the flow."
            />
          </>
        ) : null}

        {page.pageType === CustomPageType.TAKE_PHOTO ? (
          <>
            <TextInput
              label="Capture/Save Button Text"
              value={captureButtonText}
              onChange={(event) => setCaptureButtonText(event.currentTarget.value)}
              placeholder="e.g., LOVE IT"
            />
            <TextInput
              label="Retry Button Text"
              value={retryButtonText}
              onChange={(event) => setRetryButtonText(event.currentTarget.value)}
              placeholder="e.g., TRY AGAIN"
            />
            <TextInput
              label="Share Screen Next Button Text"
              value={shareNextButtonText}
              onChange={(event) => setShareNextButtonText(event.currentTarget.value)}
              placeholder="e.g., NEXT"
            />

            <Divider label="Share screen language" labelPosition="left" />
            <Text size="sm" c="dimmed">
              Shown after save when share page is on. Leave caption template empty to use the English default with the event name.
            </Text>
            <TextInput
              label="Share screen title"
              value={shareScreenTitle}
              onChange={(event) => setShareScreenTitle(event.currentTarget.value)}
              placeholder="Share Your Photo"
            />
            <TextInput
              label="Copy link button label"
              value={shareCopyLinkButtonText}
              onChange={(event) => setShareCopyLinkButtonText(event.currentTarget.value)}
              placeholder="Copy"
            />
            <TextInput
              label="View share page button label"
              value={shareViewPhotoButtonText}
              onChange={(event) => setShareViewPhotoButtonText(event.currentTarget.value)}
              placeholder="View your photo (opens share link)"
            />
            <TextInput
              label="Suggested message label"
              value={shareSuggestedMessageLabel}
              onChange={(event) => setShareSuggestedMessageLabel(event.currentTarget.value)}
              placeholder="Suggested message for apps below:"
            />
            <Textarea
              label="Social caption template"
              value={shareSocialCaptionTemplate}
              onChange={(event) => setShareSocialCaptionTemplate(event.currentTarget.value)}
              rows={2}
              placeholder="e.g. Check out my photo from {event}! - use {event} for the event name"
            />

            <TextInput
              label="Change Frame Button Text"
              value={changeButtonText}
              onChange={(event) => setChangeButtonText(event.currentTarget.value)}
              placeholder="e.g., Change"
            />
            <Textarea
              label="Success Message"
              value={successMessage}
              onChange={(event) => setSuccessMessage(event.currentTarget.value)}
              rows={2}
              placeholder="e.g., Photo saved successfully! You can now share it."
            />
            <Checkbox
              checked={showSharePage}
              onChange={(event) => setShowSharePage(event.currentTarget.checked)}
              label="Show Share Page"
              description="If unchecked, users will see a thank you message instead of share options."
            />
            {!showSharePage ? (
              <Textarea
                label="Skip Share Message"
                value={skipShareMessage}
                onChange={(event) => setSkipShareMessage(event.currentTarget.value)}
                rows={2}
                placeholder="e.g., Thank you! Your photo has been saved."
              />
            ) : null}
            <Checkbox
              checked={showFrameOnCapture}
              onChange={(event) => setShowFrameOnCapture(event.currentTarget.checked)}
              label="Show Frame During Live Capture"
              description="If checked, frame overlay is visible during live camera view."
            />

            <Divider label="Camera start prompt" labelPosition="left" />
            <TextInput
              label="Prompt Title"
              value={cameraPromptTitle}
              onChange={(event) => setCameraPromptTitle(event.currentTarget.value)}
              description="Large heading shown when camera needs to be started."
              placeholder="e.g., Ready to capture?"
            />
            <Textarea
              label="Prompt Description"
              value={cameraPromptDescription}
              onChange={(event) => setCameraPromptDescription(event.currentTarget.value)}
              rows={2}
              description="Instructional text shown below the title."
              placeholder="e.g., Click to start your camera and take a photo"
            />

            <Divider label="Error and notification messages" labelPosition="left" />
            <TextInput
              label="Frame Error Message"
              value={errorFrameMessage}
              onChange={(event) => setErrorFrameMessage(event.currentTarget.value)}
              placeholder="e.g., Failed to apply frame. Please try again."
            />
            <TextInput
              label="Save Error Message"
              value={errorSaveMessage}
              onChange={(event) => setErrorSaveMessage(event.currentTarget.value)}
              placeholder="e.g., Failed to save photo: Please try again."
            />
            <TextInput
              label="Link Copied Message"
              value={linkCopiedMessage}
              onChange={(event) => setLinkCopiedMessage(event.currentTarget.value)}
              placeholder="e.g., Link copied to clipboard!"
            />
            <TextInput
              label="Copy Error Message"
              value={copyErrorMessage}
              onChange={(event) => setCopyErrorMessage(event.currentTarget.value)}
              placeholder="e.g., Failed to copy link. Please copy it manually."
            />
            <TextInput
              label="Save First Warning Message"
              value={saveFirstMessage}
              onChange={(event) => setSaveFirstMessage(event.currentTarget.value)}
              placeholder="e.g., Please save the photo first to get a shareable link."
            />
          </>
        ) : null}

        {page.pageType === CustomPageType.RESTART ? (
          <TextInput
            label="Restart Button Text"
            value={restartButtonText}
            onChange={(event) => setRestartButtonText(event.currentTarget.value)}
            placeholder="e.g., Start again"
          />
        ) : null}

        {page.pageType !== CustomPageType.TAKE_PHOTO && (page.pageType !== CustomPageType.CTA || hasButton) ? (
          <TextInput
            label="Button Text"
            value={buttonText}
            onChange={(event) => setButtonText(event.currentTarget.value)}
            required
          />
        ) : null}

        <Group grow pt="sm">
          <Button type="submit">Save Page</Button>
          <Button type="button" variant="default" onClick={onCancel}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
