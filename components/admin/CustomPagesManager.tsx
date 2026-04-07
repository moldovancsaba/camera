/**
 * Custom Pages Manager Component
 * Version: 2.0.0
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
import { createPortal } from 'react-dom';
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
    
    const newPage: CustomPage = {
      pageId: generateId(),
      pageType: type,
      order: maxOrder + 1,  // Add at end
      isActive: true,
      config: {
        title: '',
        description: '',
        buttonText: 'Next',
        ...(type === CustomPageType.WHO_ARE_YOU && {
          nameLabel: 'Your Name',
          emailLabel: 'Your Email',
        }),
        ...(type !== CustomPageType.WHO_ARE_YOU && {
          checkboxText: '',
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
      await onSave(pagesWithPlaceholder);
    } catch (error) {
      console.error('Failed to save pages:', error);
      alert('Failed to save pages. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Event Pages</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Configure onboarding and thank you pages for this event
          </p>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Pages'}
        </button>
      </div>

      {/* Page List */}
      <div className="space-y-2 mb-4">
        {sortedPages.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            No custom pages yet. Add pages to create onboarding or thank you flows.
          </p>
        ) : (
          sortedPages.map((page, index) => (
            <div
              key={page.pageId}
              className="flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900"
            >
              {/* Order indicators */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMoveUp(page.pageId)}
                  disabled={index === 0}
                  className="text-gray-600 dark:text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMoveDown(page.pageId)}
                  disabled={index === sortedPages.length - 1}
                  className="text-gray-600 dark:text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  ▼
                </button>
              </div>

              {/* Page info */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    #{index + 1}
                  </span>
                  <span className={`text-sm font-medium px-2 py-1 rounded ${
                    page.pageType === CustomPageType.TAKE_PHOTO
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                      : page.pageType === CustomPageType.WHO_ARE_YOU
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : page.pageType === CustomPageType.ACCEPT
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400'
                      : 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-400'
                  }`}>
                    {page.pageType}
                  </span>
                  <span className="text-sm text-gray-900 dark:text-white">
                    {page.config.title || '[Untitled]'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditPage(page)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Edit
                </button>
                {page.pageType !== CustomPageType.TAKE_PHOTO && (
                  <button
                    onClick={() => handleDeletePage(page.pageId)}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Page Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => handleAddPage(CustomPageType.WHO_ARE_YOU)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
        >
          + Who Are You
        </button>
        <button
          onClick={() => handleAddPage(CustomPageType.ACCEPT)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors"
        >
          + Accept/Terms
        </button>
        <button
          onClick={() => handleAddPage(CustomPageType.CTA)}
          className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-semibold hover:bg-pink-700 transition-colors"
        >
          + CTA
        </button>
      </div>

      {/* Edit Modal - Rendered via Portal to avoid nested form */}
      {showModal && editingPage && typeof document !== 'undefined' && createPortal(
        <PageEditModal
          page={editingPage}
          onSave={handleSavePage}
          onCancel={() => {
            setShowModal(false);
            setEditingPage(null);
          }}
        />,
        document.body
      )}
    </div>
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
  // Who-are-you SSO options (v2.9.0)
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
      },
    };

    onSave(updated);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Edit {page.pageType} Page
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Page Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g., Welcome!"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Optional description text"
            />
          </div>

          {page.pageType === CustomPageType.WHO_ARE_YOU && (
            <>
              <div className="space-y-4 p-4 border border-gray-300 dark:border-gray-600 rounded-lg">
                <h4 className="text-base font-semibold text-gray-900 dark:text-white">Authentication Options</h4>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    <input
                      type="checkbox"
                      checked={enableSSOLogin}
                      onChange={(e) => setEnableSSOLogin(e.target.checked)}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    />
                    Enable Google / Facebook login
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Shows Continue with Google and Continue with Facebook (central SSO)
                  </p>
                </div>

                {enableSSOLogin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Heading above social buttons
                    </label>
                    <input
                      type="text"
                      value={ssoButtonText}
                      onChange={(e) => setSsoButtonText(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="e.g., Sign in with Google or Facebook"
                    />
                  </div>
                )}

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    <input
                      type="checkbox"
                      checked={enablePseudoReg}
                      onChange={(e) => setEnablePseudoReg(e.target.checked)}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    />
                    Enable Pseudo Registration
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Allow users to provide name and email without authentication
                  </p>
                </div>

                {enablePseudoReg && (
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Form Title
                    </label>
                    <input
                      type="text"
                      value={pseudoFormTitle}
                      onChange={(e) => setPseudoFormTitle(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="e.g., Enter your details"
                    />
                  </div>
                )}

                {!enableSSOLogin && !enablePseudoReg && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      ⚠️ At least one authentication method must be enabled
                    </p>
                  </div>
                )}
              </div>

              {enablePseudoReg && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Name Field Label *
                    </label>
                    <input
                      type="text"
                      value={nameLabel}
                      onChange={(e) => setNameLabel(e.target.value)}
                      required={enablePseudoReg}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Name Field Placeholder
                    </label>
                    <input
                      type="text"
                      value={namePlaceholder}
                      onChange={(e) => setNamePlaceholder(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="e.g., Enter your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Email Field Label *
                    </label>
                    <input
                      type="text"
                      value={emailLabel}
                      onChange={(e) => setEmailLabel(e.target.value)}
                      required={enablePseudoReg}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Email Field Placeholder
                    </label>
                    <input
                      type="text"
                      value={emailPlaceholder}
                      onChange={(e) => setEmailPlaceholder(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="e.g., your.email@example.com"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {page.pageType === CustomPageType.ACCEPT && (
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Checkbox Text *
              </label>
              <textarea
                value={checkboxText}
                onChange={(e) => setCheckboxText(e.target.value)}
                required
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="e.g., I agree to the terms and conditions"
              />
            </div>
          )}

          {page.pageType === CustomPageType.CTA && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  URL to visit
                </label>
                <input
                  type="url"
                  value={checkboxText}
                  onChange={(e) => setCheckboxText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., https://example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Visit Button Text
                </label>
                <input
                  type="text"
                  value={visitButtonText}
                  onChange={(e) => setVisitButtonText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Visit Now"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Redirecting Message
                </label>
                <input
                  type="text"
                  value={redirectingText}
                  onChange={(e) => setRedirectingText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Redirecting you shortly..."
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={hasButton}
                    onChange={(e) => setHasButton(e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                  />
                  Show Continue Button
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  If unchecked, this will be the final page in the flow
                </p>
              </div>
            </>
          )}

          {page.pageType === CustomPageType.TAKE_PHOTO && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Capture/Save Button Text
                </label>
                <input
                  type="text"
                  value={captureButtonText}
                  onChange={(e) => setCaptureButtonText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., LOVE IT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Retry Button Text
                </label>
                <input
                  type="text"
                  value={retryButtonText}
                  onChange={(e) => setRetryButtonText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., TRY AGAIN"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Share Screen Next Button Text
                </label>
                <input
                  type="text"
                  value={shareNextButtonText}
                  onChange={(e) => setShareNextButtonText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., NEXT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Change Frame Button Text
                </label>
                <input
                  type="text"
                  value={changeButtonText}
                  onChange={(e) => setChangeButtonText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Change"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Success Message
                </label>
                <textarea
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Photo saved successfully! You can now share it."
                />
              </div>
              
              {/* Share Page Toggle */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={showSharePage}
                    onChange={(e) => setShowSharePage(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  Show Share Page
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  If unchecked, users will see a thank you message instead of share options
                </p>
              </div>
              
              {!showSharePage && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Skip Share Message
                  </label>
                  <textarea
                    value={skipShareMessage}
                    onChange={(e) => setSkipShareMessage(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., Thank you! Your photo has been saved."
                  />
                </div>
              )}
              
              {/* Frame Overlay Toggle */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={showFrameOnCapture}
                    onChange={(e) => setShowFrameOnCapture(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  Show Frame During Live Capture
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  If checked, frame overlay is visible during live camera view. If unchecked, frame is only applied after capture.
                </p>
              </div>
              
              {/* Camera Prompt Text */}
              <div className="col-span-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 mt-2">Camera Start Prompt</h4>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Prompt Title
                </label>
                <input
                  type="text"
                  value={cameraPromptTitle}
                  onChange={(e) => setCameraPromptTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Ready to capture?"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Large heading shown when camera needs to be started
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Prompt Description
                </label>
                <textarea
                  value={cameraPromptDescription}
                  onChange={(e) => setCameraPromptDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Click to start your camera and take a photo"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Instructional text shown below the title
                </p>
              </div>
              
              {/* Error and Notification Messages */}
              <div className="col-span-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 mt-2">Error & Notification Messages</h4>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Frame Error Message
                </label>
                <input
                  type="text"
                  value={errorFrameMessage}
                  onChange={(e) => setErrorFrameMessage(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Failed to apply frame. Please try again."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Save Error Message
                </label>
                <input
                  type="text"
                  value={errorSaveMessage}
                  onChange={(e) => setErrorSaveMessage(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Failed to save photo: Please try again."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Link Copied Message
                </label>
                <input
                  type="text"
                  value={linkCopiedMessage}
                  onChange={(e) => setLinkCopiedMessage(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Link copied to clipboard!"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Copy Error Message
                </label>
                <input
                  type="text"
                  value={copyErrorMessage}
                  onChange={(e) => setCopyErrorMessage(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Failed to copy link. Please copy it manually."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Save First Warning Message
                </label>
                <input
                  type="text"
                  value={saveFirstMessage}
                  onChange={(e) => setSaveFirstMessage(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Please save the photo first to get a shareable link."
                />
              </div>
            </>
          )}

          {/* Button text field - conditional requirement for CTA with hasButton=false and not for take-photo */}
          {page.pageType !== CustomPageType.TAKE_PHOTO && (page.pageType !== CustomPageType.CTA || hasButton) && (
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Button Text *
              </label>
              <input
                type="text"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Save Page
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
