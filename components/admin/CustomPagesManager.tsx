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
import { InlineAlert, LabelTag } from '@sovereignsquad/gds-core/client';
import ImagePicker from '@/components/admin/library/ImagePicker';
import { CustomPageType, type CustomPage, generateId, generateTimestamp } from '@/lib/db/schemas';
import { DEFAULT_APPROVAL_TEXTS, DEFAULT_REDIRECTING_TEXT } from '@/lib/events/page-texts';
import { customiseDefault, effectiveJourney, type JourneyContext } from '@/lib/events/journey';

export interface CustomPagesManagerProps {
  eventId: string;
  initialPages: CustomPage[];
  /** What decides which default pages the event gets (`GET /api/events/<id>`): with it the list is the journey as the user goes through it (camera#378). */
  journeyContext?: JourneyContext;
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
      {helper ? <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', fontWeight: 400 }}>{helper}</span> : null}
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
      {helper ? <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', fontWeight: 400 }}>{helper}</span> : null}
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
      {helper ? <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>{helper}</span> : null}
    </label>
  );
}

function DividerLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--mantine-color-default-border)', paddingTop: '1rem' }}>
      <strong>{children}</strong>
    </div>
  );
}

export default function CustomPagesManager({ eventId, initialPages, journeyContext, onSave }: CustomPagesManagerProps) {
  const [pages, setPages] = useState<CustomPage[]>(initialPages);
  const [showModal, setShowModal] = useState(false);
  const [editingPage, setEditingPage] = useState<CustomPage | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
  // The list is the journey as the user goes through it: the own pages, the default pages that are added when the page is read, and the steps that
  // are not pages. Without the context (an editor that does not know it) it is the own pages only.
  const rows = journeyContext ? effectiveJourney(pagesWithPlaceholder, journeyContext) : sortedPages.map((page) => ({ kind: 'own' as const, page }));

  /** Customise a default page: the event's own page, filled with the default's texts, in the default's place; it is added when the editor saves it. */
  const handleCustomise = (page: CustomPage) => {
    setEditingPage(customiseDefault(page));
    setShowModal(true);
  };

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
    const minOrder = pages.length > 0 ? Math.min(...pages.map(p => p.order)) : 0;
    
    const defaultTitle =
      type === CustomPageType.WHO_ARE_YOU
        ? 'Who are you?'
        : type === CustomPageType.ACCEPT
          ? 'Please accept'
          : type === CustomPageType.RESTART
            ? 'Ready for the next guest?'
            : type === CustomPageType.WELCOME
              ? 'Welcome'
              : 'Next step';

    const newPage: CustomPage = {
      pageId: generateId(),
      pageType: type,
      order: type === CustomPageType.WELCOME ? minOrder - 1 : maxOrder + 1,  // Step 0 goes first, any other page at the end
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
        ...(type === CustomPageType.WELCOME && {
          buttonText: 'Start',
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
    <section style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', padding: '1.5rem' }}>
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <h2 style={{ margin: 0 }}>Pages of the user journey</h2>
            <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.875rem', margin: 0 }}>
              {journeyContext
                ? 'The journey in the order a user goes through it. A default page is used until you customise it; the steps marked built in are not pages, and the text next to them says where they are edited.'
                : 'Configure the pages of the user journey for this event'}
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
        {rows.map((row, index) => {
          if (row.kind === 'step') {
            return (
              <article key={`step-${row.id}`} style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: '0.875rem', padding: '1rem' }}>
                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <code style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.875rem' }}>#{index + 1}</code>
                    <LabelTag tone="neutral" label="Built in" />
                  </div>
                  <strong style={{ fontSize: '0.875rem' }}>{row.title}</strong>
                  <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>{row.description}</span>
                  <span style={{ fontSize: '0.8125rem' }}>Edited in: {row.editedIn}</span>
                </div>
              </article>
            );
          }
          if (row.kind === 'default') {
            return (
              <article key={row.page.pageId} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.875rem', padding: '1rem' }}>
                <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
                  <div style={{ display: 'grid', flex: 1, gap: '0.25rem', minWidth: 0 }}>
                    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <code style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.875rem' }}>#{index + 1}</code>
                      <LabelTag tone="info" label="Default" />
                      <LabelTag tone="neutral" label={row.page.pageType} />
                    </div>
                    <strong style={{ fontSize: '0.875rem' }}>{row.page.config.title || '[Untitled]'}</strong>
                    <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>{row.reason}</span>
                  </div>
                  <SemanticButton action="custom-pages:customise-default" type="button" size="xs" variant="secondary" onClick={() => handleCustomise(row.page)}>
                    Customise
                  </SemanticButton>
                </div>
              </article>
            );
          }
          const page = row.page;
          const ownIndex = sortedPages.findIndex((p) => p.pageId === page.pageId);
          return (
              <article
              key={page.pageId}
                style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.875rem', padding: '1rem' }}
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
                  disabled={ownIndex === 0}
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
                  disabled={ownIndex === sortedPages.length - 1}
                  title="Move down"
                >
                  ▼
                    </SemanticButton>
                  </div>

              {/* Page info */}
                  <div style={{ display: 'grid', flex: 1, gap: '0.25rem' }}>
                    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <code style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.875rem' }}>
                    #{index + 1}
                      </code>
                      <LabelTag tone="neutral" label={page.pageType} />
                      {page.isActive ? null : <LabelTag tone="warning" label="Switched off: users do not see it" />}
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
          );
        })}
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
            action="custom-pages:add-welcome"
            type="button"
            variant="secondary"
            onClick={() => handleAddPage(CustomPageType.WELCOME)}
          >
            + Welcome (step 0)
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
          style={{ background: 'var(--gds-overlay-scrim)', inset: 0, display: 'grid', placeItems: 'center', padding: '1rem', position: 'fixed', zIndex: 1000 }}
        >
          <div style={{ background: 'var(--gds-overlay-surface)', border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', maxHeight: '90vh', maxWidth: 760, overflowY: 'auto', padding: '1.5rem', width: '100%' }}>
          <h2 id="custom-page-editor-title" style={{ marginTop: 0 }}>{editingPage ? `Edit ${editingPage.pageType} Page` : 'Edit Page'}</h2>
          {editingPage ? (
            <PageEditModal
              page={editingPage}
              eventId={eventId}
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
 * Modal for editing page configuration. `eventId` (the event's Mongo _id) is the library the pictures are chosen from (camera#368).
 */
function PageEditModal({
  page,
  eventId,
  onSave,
  onCancel,
}: {
  page: CustomPage;
  eventId: string;
  onSave: (page: CustomPage) => void;
  onCancel: () => void;
}) {
  const pictureLevel = { scope: 'event' as const, eventId };
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
  // The checkboxes of a consent page, each with an optional https link; all required (camera#330). Empty list: the single text above is the one checkbox.
  const [checkboxes, setCheckboxes] = useState<Array<{ text: string; linkUrl: string }>>(() => (page.config.checkboxes ?? []).map((item) => ({ text: item.text, linkUrl: item.linkUrl ?? '' })));
  // For CTA pages: hasButton determines if button is shown (if false, it's an end page)
  const [hasButton, setHasButton] = useState(page.config.hasButton !== false);
  // Picture pages only (camera#491)
  const [hideTexts, setHideTexts] = useState(page.config.hideTexts === true);
  const [hideButtons, setHideButtons] = useState(page.config.hideButtons === true);
  const [pictureLink, setPictureLink] = useState(page.config.pictureLink === true);
  const [visitButtonText, setVisitButtonText] = useState(page.config.visitButtonText || 'Visit Now');
  // Empty = the default text, shown as the placeholder (camera#337)
  const [redirectingText, setRedirectingText] = useState(page.config.redirectingText || '');
  // For take-photo page: button texts
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
  // Texts while a photo waits for approval; empty = the default text, shown as the placeholder (camera#333)
  const [pendingTitle, setPendingTitle] = useState(page.config.pendingTitle || '');
  const [pendingSavedMessage, setPendingSavedMessage] = useState(page.config.pendingSavedMessage || '');
  const [pendingPreviewNotice, setPendingPreviewNotice] = useState(page.config.pendingPreviewNotice || '');
  const [pendingWaitingMessage, setPendingWaitingMessage] = useState(page.config.pendingWaitingMessage || '');
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
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(page.config.backgroundImageUrl || '');
  const [bottomImageUrl, setBottomImageUrl] = useState(page.config.bottomImageUrl || '');
  const [cornerImageUrl, setCornerImageUrl] = useState(page.config.cornerImageUrl || '');
  const [screenImageUrl, setScreenImageUrl] = useState(page.config.screenImageUrl || '');
  const [screenImageAlt, setScreenImageAlt] = useState(page.config.screenImageAlt || '');
  const [buttonColor, setButtonColor] = useState(page.config.buttonColor || '');
  const [buttonTextColor, setButtonTextColor] = useState(page.config.buttonTextColor || '');
  const [buttonBorderColor, setButtonBorderColor] = useState(page.config.buttonBorderColor || '');

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
          checkboxes: checkboxes
            .map((item) => ({ text: item.text.trim(), linkUrl: item.linkUrl.trim() }))
            .filter((item) => item.text)
            .map((item) => (item.linkUrl ? item : { text: item.text })),
        }),
        ...(page.pageType === CustomPageType.CTA && {
          checkboxText,
          hasButton,
          visitButtonText,
          redirectingText: redirectingText.trim() || undefined,
        }),
        ...(page.pageType === CustomPageType.TAKE_PHOTO && {
          // Not used any more: the reframe screen's Continue and Retake replaced the "love it" screen (camera#344). Kept as they are, never deleted.
          captureButtonText: page.config.captureButtonText,
          retryButtonText: page.config.retryButtonText,
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
          pendingTitle: pendingTitle.trim() || undefined,
          pendingSavedMessage: pendingSavedMessage.trim() || undefined,
          pendingPreviewNotice: pendingPreviewNotice.trim() || undefined,
          pendingWaitingMessage: pendingWaitingMessage.trim() || undefined,
        }),
        ...(page.pageType === CustomPageType.RESTART && {
          restartButtonText,
        }),
        ...(page.pageType === CustomPageType.WELCOME && {
          backgroundImageUrl: backgroundImageUrl.trim() || undefined,
          bottomImageUrl: bottomImageUrl.trim() || undefined,
          cornerImageUrl: cornerImageUrl.trim() || undefined,
          screenImageUrl: screenImageUrl.trim() || undefined,
          screenImageAlt: screenImageAlt.trim() || undefined,
          buttonColor: buttonColor.trim() || undefined,
          buttonTextColor: buttonTextColor.trim() || undefined,
          buttonBorderColor: buttonBorderColor.trim() || undefined,
        }),
        ...(page.pageType === CustomPageType.CTA && {
          backgroundImageUrl: backgroundImageUrl.trim() || undefined,
          hideTexts: hideTexts || undefined,
          hideButtons: hideButtons || undefined,
          pictureLink: pictureLink || undefined,
          buttonColor: buttonColor.trim() || undefined,
          buttonTextColor: buttonTextColor.trim() || undefined,
          buttonBorderColor: buttonBorderColor.trim() || undefined,
        }),
      },
    };

    onSave(updated);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <Field
          label="Page Title"
          value={title}
          onChange={setTitle}
          required
          placeholder="e.g., Welcome!"
          helper={page.pageType === CustomPageType.WELCOME ? 'Read by screen readers, not shown on the page.' : undefined}
        />
        {page.pageType === CustomPageType.WELCOME ? null : (
          <Area label="Description" value={description} onChange={setDescription} rows={3} placeholder="Optional description text" />
        )}

        {page.pageType === CustomPageType.CTA ? (
          <section style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.875rem', padding: '1rem' }}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <h4 style={{ margin: 0 }}>Picture page (optional)</h4>
              <ImagePicker
                label="Background picture"
                value={backgroundImageUrl}
                onChange={setBackgroundImageUrl}
                level={pictureLevel}
                helper="The whole picture fits the screen and keeps its shape (the page colour of the event shows around it); the title, the text and the buttons are written over it (white, with a soft dark veil) unless you hide them below. Leave empty for the plain card."
              />
              <Check
                checked={hideTexts}
                onChange={setHideTexts}
                label="Hide the title and the text"
                helper="Only the picture and the buttons show. A screen reader still reads the title."
              />
              <Check
                checked={pictureLink}
                onChange={setPictureLink}
                label="The whole picture is a link to the URL"
                helper="A tap on the picture goes to the URL above. With the buttons hidden and Show Continue Button on, it opens the URL in a new tab and goes on to the next page; on the last page it goes to the URL in the same tab."
              />
              <Check
                checked={hideButtons}
                onChange={setHideButtons}
                label="Hide the buttons"
                helper="Works when the picture is a link, or when this is the last page (Show Continue Button off). Otherwise the buttons stay, so nobody gets stuck on the page."
              />
              <Field label="Button colour" value={buttonColor} onChange={setButtonColor} placeholder="#RRGGBB" />
              <Field label="Button label colour" value={buttonTextColor} onChange={setButtonTextColor} placeholder="#RRGGBB" />
              <Field label="Button ring colour" value={buttonBorderColor} onChange={setButtonBorderColor} placeholder="#RRGGBB" />
            </div>
          </section>
        ) : null}

        {page.pageType === CustomPageType.WELCOME ? (
          <section style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.875rem', padding: '1rem' }}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <h4 style={{ margin: 0 }}>Landing page elements (each one is optional)</h4>
              <Field
                label="Start button text"
                value={buttonText}
                onChange={setButtonText}
                required
                placeholder="e.g., START"
                helper="The only words on the page. Write it in the language of the event."
              />
              <ImagePicker
                label="Background picture"
                value={backgroundImageUrl}
                onChange={setBackgroundImageUrl}
                level={pictureLevel}
                helper="Fills the screen in portrait and landscape (scaled to cover, centred). Leave empty for no picture: the page colour of the event shows."
              />
              <ImagePicker
                label="Left image (bottom left)"
                value={bottomImageUrl}
                onChange={setBottomImageUrl}
                level={pictureLevel}
                helper="Transparent PNG on the bottom edge: full width in portrait, half the width at the left edge in landscape. Leave empty for no left image."
              />
              <ImagePicker
                label="Right image (bottom right)"
                value={cornerImageUrl}
                onChange={setCornerImageUrl}
                level={pictureLevel}
                helper="Transparent PNG of the same size as the left image, at the same scale: over it in portrait, half the width at the right edge in landscape. Leave empty for no right image."
              />
              <ImagePicker
                label="Giant screen picture"
                value={screenImageUrl}
                onChange={setScreenImageUrl}
                level={pictureLevel}
                helper="Shown on a 3D giant screen above the Start button (drawn by camera, tilted and swaying). 16:9 works best. Leave empty: an event that has the picture drawn from its default slideshow (Slideshows, Welcome page screen) shows that one; any other event has no giant screen."
              />
              <Field label="Giant screen picture description" value={screenImageAlt} onChange={setScreenImageAlt} placeholder="What the screen shows, for screen readers" />
              <Field label="Start button colour" value={buttonColor} onChange={setButtonColor} placeholder="e.g., the club's official colour, as #RRGGBB" />
              <Field label="Start button label colour" value={buttonTextColor} onChange={setButtonTextColor} placeholder="#RRGGBB" />
              <Field label="Start button ring colour" value={buttonBorderColor} onChange={setButtonBorderColor} placeholder="#RRGGBB" />
            </div>
          </section>
        ) : null}

        {page.pageType === CustomPageType.WHO_ARE_YOU ? (
          <>
            <section style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.875rem', padding: '1rem' }}>
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
          <>
            <section style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.875rem', padding: '1rem' }}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <h4 style={{ margin: 0 }}>Checkboxes (every one is required)</h4>
                <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.875rem', margin: 0 }}>
                  The user must tick every checkbox to continue. A link opens that page in a new tab. Leave the list empty to use the single text below.
                </p>
                {checkboxes.map((item, index) => (
                  <div key={index} style={{ display: 'grid', gap: '0.5rem', borderTop: index > 0 ? '1px solid var(--mantine-color-default-border)' : undefined, paddingTop: index > 0 ? '0.75rem' : 0 }}>
                    <Field
                      label={`Checkbox ${index + 1} text`}
                      value={item.text}
                      onChange={(value) => setCheckboxes((list) => list.map((entry, at) => (at === index ? { ...entry, text: value } : entry)))}
                      placeholder="e.g., I accept the Terms and conditions"
                    />
                    <Field
                      type="url"
                      label={`Checkbox ${index + 1} link (https, optional)`}
                      value={item.linkUrl}
                      onChange={(value) => setCheckboxes((list) => list.map((entry, at) => (at === index ? { ...entry, linkUrl: value } : entry)))}
                      placeholder="https://example.com/terms"
                    />
                    <div>
                      <SemanticButton action="custom-pages:remove-checkbox" type="button" variant="secondary" onClick={() => setCheckboxes((list) => list.filter((_, at) => at !== index))}>
                        Remove checkbox {index + 1}
                      </SemanticButton>
                    </div>
                  </div>
                ))}
                <div>
                  <SemanticButton action="custom-pages:add-checkbox" type="button" variant="secondary" onClick={() => setCheckboxes((list) => [...list, { text: '', linkUrl: '' }])} disabled={checkboxes.length >= 10}>
                    Add a checkbox
                  </SemanticButton>
                </div>
              </div>
            </section>
            <Area
              label="Single checkbox text (used when the list above is empty)"
              value={checkboxText}
              onChange={setCheckboxText}
              required={checkboxes.filter((item) => item.text.trim()).length === 0}
              rows={2}
              placeholder="e.g., I agree to the terms and conditions"
            />
          </>
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
              placeholder={DEFAULT_REDIRECTING_TEXT}
              helper="Shown on the visit button after it was pressed. Empty: the text in grey."
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
              label="Share Screen Next Button Text"
              value={shareNextButtonText}
              onChange={setShareNextButtonText}
              placeholder="e.g., NEXT"
            />

            <DividerLabel>Share options screen language</DividerLabel>
            <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.875rem', margin: 0 }}>
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

            <DividerLabel>Photo approval texts</DividerLabel>
            <Field
              label="Waiting Title"
              value={pendingTitle}
              onChange={setPendingTitle}
              placeholder={DEFAULT_APPROVAL_TEXTS.title}
              helper="For events with photo approval. Empty: the text in grey, in every field of this group."
            />
            <Area
              label="Frame Notice"
              value={pendingPreviewNotice}
              onChange={setPendingPreviewNotice}
              rows={2}
              placeholder={DEFAULT_APPROVAL_TEXTS.previewNotice}
              helper="Above the Continue button of the photo screen, before the photo is saved."
            />
            <Area
              label="Saved Message"
              value={pendingSavedMessage}
              onChange={setPendingSavedMessage}
              rows={2}
              placeholder={DEFAULT_APPROVAL_TEXTS.savedMessage}
              helper="An extra notification after the photo was saved. Leave it empty: the waiting card already says the photo waits, and a second message on top of it runs into the card."
            />
            <Area
              label="Waiting Message"
              value={pendingWaitingMessage}
              onChange={setPendingWaitingMessage}
              rows={3}
              placeholder={DEFAULT_APPROVAL_TEXTS.waitingMessage}
              helper="Below the title. Tell the user how the link arrives. Your own text is shown as written."
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

        {page.pageType !== CustomPageType.TAKE_PHOTO && page.pageType !== CustomPageType.WELCOME && (page.pageType !== CustomPageType.CTA || hasButton) ? (
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
