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

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useState } from 'react';
import { InlineAlert, LabelTag, StateBlock } from '@doneisbetter/gds-core/client';
import { CustomPageType, type CustomPage, generateId, generateTimestamp } from '@/lib/db/schemas';

export interface CustomPagesManagerProps {
  eventId: string;
  initialPages: CustomPage[];
  onSave: (pages: CustomPage[]) => Promise<void>;
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = 'text',
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  helper?: string;
}) {
  return (
    <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        required={required}
        placeholder={placeholder}
        style={{ minHeight: 44, padding: '0 0.75rem' }}
      />
      {helper ? <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.8125rem', fontWeight: 400 }}>{helper}</span> : null}
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  required,
  placeholder,
  rows = 3,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  helper?: string;
}) {
  return (
    <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        required={required}
        placeholder={placeholder}
        rows={rows}
        style={{ padding: '0.75rem' }}
      />
      {helper ? <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.8125rem', fontWeight: 400 }}>{helper}</span> : null}
    </label>
  );
}

function Check({
  checked,
  onChange,
  label,
  helper,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  helper?: string;
}) {
  return (
    <label style={{ display: 'grid', gap: '0.35rem' }}>
      <span style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
        {label}
      </span>
      {helper ? <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.8125rem' }}>{helper}</span> : null}
    </label>
  );
}

function DividerLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--gds-color-border)', paddingTop: '1rem' }}>
      <strong>{children}</strong>
    </div>
  );
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
    <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', padding: '1.5rem' }}>
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <h2 style={{ margin: 0 }}>Event Pages</h2>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
              Configure onboarding and thank you pages for this event
            </p>
          </div>
          <SemanticButton
            action="custom-pages:save-all"
            type="button"
          onClick={handleSaveAll}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Pages'}
          </SemanticButton>
        </div>

      {/* Page List */}
        <div style={{ display: 'grid', gap: '0.75rem' }}>
        {sortedPages.length === 0 ? (
            <StateBlock variant="empty" title="No custom pages yet" description="Add pages to create onboarding or thank you flows." />
        ) : (
          sortedPages.map((page, index) => (
              <article
              key={page.pageId}
                style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}
            >
              {/* Order indicators */}
                <div style={{ alignItems: 'center', display: 'flex', gap: '1rem' }}>
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <SemanticButton
                      action="custom-pages:move-up"
                      type="button"
                      variant="secondary"
                      size="compact-xs"
                  onClick={() => handleMoveUp(page.pageId)}
                  disabled={index === 0}
                  title="Move up"
                >
                  ▲
                    </SemanticButton>
                    <SemanticButton
                      action="custom-pages:move-down"
                      type="button"
                      variant="secondary"
                      size="compact-xs"
                  onClick={() => handleMoveDown(page.pageId)}
                  disabled={index === sortedPages.length - 1}
                  title="Move down"
                >
                  ▼
                    </SemanticButton>
                  </div>

              {/* Page info */}
                  <div style={{ display: 'grid', flex: 1, gap: '0.25rem' }}>
                    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <code style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem' }}>
                    #{index + 1}
                      </code>
                      <LabelTag tone="neutral" label={page.pageType} />
                    </div>
                    <strong style={{ fontSize: '0.875rem' }}>
                    {page.config.title || '[Untitled]'}
                    </strong>
                  </div>

              {/* Actions */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <SemanticButton
                      action="custom-pages:edit"
                      type="button"
                      size="xs"
                      variant="secondary"
                  onClick={() => handleEditPage(page)}
                >
                  Edit
                    </SemanticButton>
                {page.pageType !== CustomPageType.TAKE_PHOTO && (
                      <SemanticButton
                        action="custom-pages:delete"
                        type="button"
                        size="xs"
                        variant="danger"
                    onClick={() => handleDeletePage(page.pageId)}
                  >
                    Delete
                      </SemanticButton>
                )}
                  </div>
                </div>
              </article>
          ))
        )}
        </div>

      {/* Add Page Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <SemanticButton
            action="custom-pages:add-who-are-you"
            type="button"
            variant="secondary"
          onClick={() => handleAddPage(CustomPageType.WHO_ARE_YOU)}
        >
          + Who Are You
          </SemanticButton>
          <SemanticButton
            action="custom-pages:add-accept"
            type="button"
            variant="secondary"
          onClick={() => handleAddPage(CustomPageType.ACCEPT)}
        >
          + Accept/Terms
          </SemanticButton>
          <SemanticButton
            action="custom-pages:add-cta"
            type="button"
            variant="secondary"
          onClick={() => handleAddPage(CustomPageType.CTA)}
        >
          + CTA
          </SemanticButton>
          <SemanticButton
            action="custom-pages:add-restart"
            type="button"
            variant="secondary"
          onClick={() => handleAddPage(CustomPageType.RESTART)}
        >
          + Restart
          </SemanticButton>
        </div>

      {/* Edit Modal - Rendered via Portal to avoid nested form */}
        {showModal && editingPage !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-page-editor-title"
          style={{ background: 'var(--gds-color-overlay)', inset: 0, display: 'grid', placeItems: 'center', padding: '1rem', position: 'fixed', zIndex: 1000 }}
        >
          <div style={{ background: 'var(--gds-color-surface)', border: '1px solid var(--gds-color-border)', borderRadius: '1rem', maxHeight: '90vh', maxWidth: 760, overflowY: 'auto', padding: '1.5rem', width: '100%' }}>
          <h2 id="custom-page-editor-title" style={{ marginTop: 0 }}>{editingPage ? `Edit ${editingPage.pageType} Page` : 'Edit Page'}</h2>
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
          </div>
        </div>
        ) : null}
      </div>
    </section>
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
      <div style={{ display: 'grid', gap: '1rem' }}>
        <Field label="Page Title" value={title} onChange={setTitle} required placeholder="e.g., Welcome!" />
        <Area label="Description" value={description} onChange={setDescription} rows={3} placeholder="Optional description text" />

        {page.pageType === CustomPageType.WHO_ARE_YOU ? (
          <>
            <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <h4 style={{ margin: 0 }}>Authentication Options</h4>
                <Check
                  checked={enableSSOLogin}
                  onChange={setEnableSSOLogin}
                  label="Enable Google / Facebook login"
                  helper="Shows Continue with Google and Continue with Facebook."
                />
                {enableSSOLogin ? (
                  <Field
                    label="Heading above social buttons"
                    value={ssoButtonText}
                    onChange={setSsoButtonText}
                    placeholder="e.g., Sign in with Google or Facebook"
                  />
                ) : null}
                <Check
                  checked={enablePseudoReg}
                  onChange={setEnablePseudoReg}
                  label="Enable pseudo registration"
                  helper="Allow users to provide name and email without authentication."
                />
                {enablePseudoReg ? (
                  <Field
                    label="Form Title"
                    value={pseudoFormTitle}
                    onChange={setPseudoFormTitle}
                    placeholder="e.g., Enter your details"
                  />
                ) : null}
                {!enableSSOLogin && !enablePseudoReg ? (
                  <InlineAlert title="Authentication required" message="At least one authentication method must be enabled." severity="warning" />
                ) : null}
              </div>
            </section>

            {enablePseudoReg ? (
              <>
                <Field
                  label="Name Field Label"
                  value={nameLabel}
                  onChange={setNameLabel}
                  required
                />
                <Field
                  label="Name Field Placeholder"
                  value={namePlaceholder}
                  onChange={setNamePlaceholder}
                  placeholder="e.g., Enter your name"
                />
                <Field
                  label="Email Field Label"
                  value={emailLabel}
                  onChange={setEmailLabel}
                  required
                />
                <Field
                  label="Email Field Placeholder"
                  value={emailPlaceholder}
                  onChange={setEmailPlaceholder}
                  placeholder="e.g., your.email@example.com"
                />
              </>
            ) : null}
          </>
        ) : null}

        {page.pageType === CustomPageType.ACCEPT ? (
          <Area
            label="Checkbox Text"
            value={checkboxText}
            onChange={setCheckboxText}
            required
            rows={2}
            placeholder="e.g., I agree to the terms and conditions"
          />
        ) : null}

        {page.pageType === CustomPageType.CTA ? (
          <>
            <Field
              type="url"
              label="URL to visit"
              value={checkboxText}
              onChange={setCheckboxText}
              placeholder="e.g., https://example.com"
            />
            <Field
              label="Visit Button Text"
              value={visitButtonText}
              onChange={setVisitButtonText}
              placeholder="e.g., Visit Now"
            />
            <Field
              label="Redirecting Message"
              value={redirectingText}
              onChange={setRedirectingText}
              placeholder="e.g., Redirecting you shortly..."
            />
            <Check
              checked={hasButton}
              onChange={setHasButton}
              label="Show Continue Button"
              helper="If unchecked, this will be the final page in the flow."
            />
          </>
        ) : null}

        {page.pageType === CustomPageType.TAKE_PHOTO ? (
          <>
            <Field
              label="Capture/Save Button Text"
              value={captureButtonText}
              onChange={setCaptureButtonText}
              placeholder="e.g., LOVE IT"
            />
            <Field
              label="Retry Button Text"
              value={retryButtonText}
              onChange={setRetryButtonText}
              placeholder="e.g., TRY AGAIN"
            />
            <Field
              label="Share Screen Next Button Text"
              value={shareNextButtonText}
              onChange={setShareNextButtonText}
              placeholder="e.g., NEXT"
            />

            <DividerLabel>Share options screen language</DividerLabel>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
              Shown after save when share options are enabled. Email delivery is controlled separately in the event notification settings.
            </p>
            <Field
              label="Share screen title"
              value={shareScreenTitle}
              onChange={setShareScreenTitle}
              placeholder="Share Your Photo"
            />
            <Field
              label="Copy link button label"
              value={shareCopyLinkButtonText}
              onChange={setShareCopyLinkButtonText}
              placeholder="Copy"
            />
            <Field
              label="View share page button label"
              value={shareViewPhotoButtonText}
              onChange={setShareViewPhotoButtonText}
              placeholder="View your photo (opens share link)"
            />
            <Field
              label="Suggested message label"
              value={shareSuggestedMessageLabel}
              onChange={setShareSuggestedMessageLabel}
              placeholder="Suggested message for apps below:"
            />
            <Area
              label="Social caption template"
              value={shareSocialCaptionTemplate}
              onChange={setShareSocialCaptionTemplate}
              rows={2}
              placeholder="e.g. Check out my photo from {event}! - use {event} for the event name"
            />

            <Field
              label="Change Frame Button Text"
              value={changeButtonText}
              onChange={setChangeButtonText}
              placeholder="e.g., Change"
            />
            <Area
              label="Success Message"
              value={successMessage}
              onChange={setSuccessMessage}
              rows={2}
              placeholder="e.g., Photo saved successfully! You can now share it."
            />
            <Check
              checked={showSharePage}
              onChange={setShowSharePage}
              label="Show share options after save"
              helper="If unchecked, users see a thank-you message instead. Email can still be sent if the event notification module is enabled."
            />
            {!showSharePage ? (
              <Area
                label="Skip Share Message"
                value={skipShareMessage}
                onChange={setSkipShareMessage}
                rows={2}
                placeholder="e.g., Thank you! Your photo has been saved."
              />
            ) : null}
            <Check
              checked={showFrameOnCapture}
              onChange={setShowFrameOnCapture}
              label="Show Frame During Live Capture"
              helper="If checked, frame overlay is visible during live camera view."
            />

            <DividerLabel>Camera start prompt</DividerLabel>
            <Field
              label="Prompt Title"
              value={cameraPromptTitle}
              onChange={setCameraPromptTitle}
              helper="Large heading shown when camera needs to be started."
              placeholder="e.g., Ready to capture?"
            />
            <Area
              label="Prompt Description"
              value={cameraPromptDescription}
              onChange={setCameraPromptDescription}
              rows={2}
              helper="Instructional text shown below the title."
              placeholder="e.g., Click to start your camera and take a photo"
            />

            <DividerLabel>Error and notification messages</DividerLabel>
            <Field
              label="Frame Error Message"
              value={errorFrameMessage}
              onChange={setErrorFrameMessage}
              placeholder="e.g., Failed to apply frame. Please try again."
            />
            <Field
              label="Save Error Message"
              value={errorSaveMessage}
              onChange={setErrorSaveMessage}
              placeholder="e.g., Failed to save photo: Please try again."
            />
            <Field
              label="Link Copied Message"
              value={linkCopiedMessage}
              onChange={setLinkCopiedMessage}
              placeholder="e.g., Link copied to clipboard!"
            />
            <Field
              label="Copy Error Message"
              value={copyErrorMessage}
              onChange={setCopyErrorMessage}
              placeholder="e.g., Failed to copy link. Please copy it manually."
            />
            <Field
              label="Save First Warning Message"
              value={saveFirstMessage}
              onChange={setSaveFirstMessage}
              placeholder="e.g., Please save the photo first to get a shareable link."
            />
          </>
        ) : null}

        {page.pageType === CustomPageType.RESTART ? (
          <Field
            label="Restart Button Text"
            value={restartButtonText}
            onChange={setRestartButtonText}
            placeholder="e.g., Start again"
          />
        ) : null}

        {page.pageType !== CustomPageType.TAKE_PHOTO && (page.pageType !== CustomPageType.CTA || hasButton) ? (
          <Field
            label="Button Text"
            value={buttonText}
            onChange={setButtonText}
            required
          />
        ) : null}

        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', paddingTop: '0.5rem' }}>
          <SemanticButton action="custom-pages:save-page" type="submit">Save Page</SemanticButton>
          <SemanticButton action="custom-pages:cancel-page" type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </SemanticButton>
        </div>
      </div>
    </form>
  );
}
