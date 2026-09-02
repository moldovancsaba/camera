/**
 * Database Schemas and TypeScript Types
 * 
 * Defines the structure of all MongoDB collections and their TypeScript interfaces.
 * All dates stored as ISO 8601 strings with milliseconds in UTC: YYYY-MM-DDTHH:MM:SS.sssZ
 * 
 * Collections:
 * - partners: Organizations/brands that host events
 * - events: Events within partners that use frames and custom page flows
 * - frames: Pre-designed frame templates with three-tier ownership (global/partner/event)
 * - submissions: User photo submissions with comprehensive metadata and onboarding data
 * - users_cache: Optional cache of SSO user data for performance
 * 
 * Frame Visibility Hierarchy:
 * - Global frames: Available to all partners/events, can be deactivated per partner/event
 * - Partner frames: Available only to specific partner's events, can be deactivated per event
 * - Event frames: Available only to specific event
 * 
 * Custom Page Flows:
 * - Events can have custom onboarding and thank you pages
 * - Pages are drag-and-drop reorderable including [Take Photo] step
 * - Page types: 'who-are-you' (data collection), 'accept' (consent), 'cta' (call to action), 'take-photo' (capture), 'restart' (restart full journey)
 * - Collected data (name, email, consents) stored with each submission
 */

import { ObjectId } from 'mongodb';
import type { SlideshowLayoutCellAspect } from '@/lib/slideshow/viewport-scale';

/**
 * Collection Names
 * Centralized constant to ensure consistency across the application
 */
export const COLLECTIONS = {
  ORGANIZATIONS: 'organizations',
  PARTNERS: 'partners',
  EVENTS: 'events',
  FRAMES: 'frames',
  LOGOS: 'logos',
  SUBMISSIONS: 'submissions',
  LEATHER_SUITS: 'leather_suits',
  TRYON_JOBS: 'tryon_jobs',
  TRYON_WORKER_HEARTBEATS: 'tryon_worker_heartbeats',
  TRYON_MODERATION_EVENTS: 'tryon_moderation_events',
  TRYON_SETUPS: 'tryon_setups',
  CAMERA_SETUP_PREFERENCES: 'camera_setup_preferences',
  USERS_CACHE: 'users_cache',
  SLIDESHOWS: 'slideshows',
  SLIDESHOW_LAYOUTS: 'slideshow_layouts',
  LANDING_PAGES: 'landing_pages',
  LANDING_PAGE_CSS_PRESETS: 'landing_page_css_presets',
  PARTNER_USER_ACCESS: 'partner_user_access',
  /** Server-side OAuth/session payload; browser holds only a small pointer cookie (`v:2`). */
  WEB_SESSIONS: 'web_sessions',
  ADMIN_SETTINGS: 'admin_settings',
} as const;

// ============================================================================
// ADMIN SETTINGS COLLECTION
// ============================================================================

/**
 * Which elements render on the Vetting moderation card. One global document
 * (settingId: 'card-display') -- there is no per-admin-user preference
 * system in this app, so this is a shared, app-wide default for every admin.
 * Every field defaults to true (current behavior) so shipping this changes
 * nothing until an admin explicitly turns something off.
 */
export interface AdminCardDisplaySettings {
  _id?: ObjectId;
  settingId: 'card-display';
  metadata: {
    email: boolean;
    eventPartner: boolean;
    garmentName: boolean;
  };
  status: {
    reviewBadge: boolean;
    greatBadge: boolean;
    visibilityLabel: boolean;
    assetHealth: boolean;
  };
  actions: {
    approveReject: boolean;
    great: boolean;
    service: boolean;
    view: boolean;
    download: boolean;
    fix: boolean;
    remove: boolean;
    rerunControls: boolean;
    pinToSlideshow: boolean;
  };
  updatedAt: string;
  updatedBy: string | null;
}

// ============================================================================
// PARTNERS COLLECTION
// ============================================================================

/**
 * Partner Document Interface
 * Represents an organization or brand that hosts events
 * 
 * Why partners:
 * - Organizations need to manage their own events and frames
 * - Enables white-label frame collections per partner
 * - Future: partner data will sync via external API
 * 
 * Example: AC Milan, Red Bull, Nike
 */
/**
 * Organization — the parent entity that groups partners (mirrors messmass
 * organisations). messmass is the source of truth; camera receives them via the
 * provisioning API and stamps messmassOrganizationId for a shared identity.
 */
export interface Organization {
  _id?: ObjectId;
  organizationId: string;            // Unique organization identifier (UUID)
  name: string;
  messmassOrganizationId?: string;   // Cross-ref to the messmass organisation (_id)
  source?: string;                   // 'messmass' when provisioned from messmass
  createdAt: string;
  updatedAt: string;
}

export interface Partner {
  _id?: ObjectId;                    // MongoDB document ID
  partnerId: string;                 // Unique partner identifier (UUID)
  name: string;                      // Partner name (e.g., "AC Milan")
  description?: string;              // Optional partner description
  isActive: boolean;                 // Whether partner is currently active
  organizationId?: string;           // Parent organization (Organization.organizationId)
  messmassPartnerId?: string;        // Cross-ref to the messmass partner (_id) — shared identity
  
  // Contact and metadata
  contactEmail?: string;             // Partner contact email
  contactName?: string;              // Partner contact person
  logoUrl?: string;                  // Partner logo URL (imgbb.com)
  
  // Default styles for child events
  // These defaults cascade to all non-orphaned events under this partner
  // Events can override these to become "orphans" (independent of partner changes)
  defaultBrandColors?: {
    primary?: string;                // Default primary brand color (hex)
    secondary?: string;              // Default secondary brand color (hex)
    accent?: string;                 // Default accent brand color (hex)
  };
  defaultFrames?: string[];          // Default frame IDs to assign to new events
  defaultLogos?: Array<{             // Default logo assignments for new events
    logoId: string;                  // Reference to logo
    scenario: LogoScenario;          // Where/when to display this logo
    order: number;                   // Order for random selection
  }>;
  
  // Statistics
  eventCount?: number;               // Cached count of partner's events
  frameCount?: number;               // Cached count of partner-specific frames
  
  // Admin tracking
  createdBy: string;                 // Admin user ID from SSO who created this partner
  createdAt: string;                 // ISO 8601 timestamp with milliseconds UTC
  updatedAt: string;                 // ISO 8601 timestamp with milliseconds UTC
}

// ============================================================================
// EVENTS COLLECTION
// ============================================================================

/**
 * Custom Page Type
 * Defines the type of page in the event flow
 * 
 * Why four types:
 * - who-are-you: Collect user information (name, email) before photo capture
 * - accept: GDPR/terms consent with required checkbox
 * - cta: Call-to-action that can redirect to URL, optional button (if no button = end page)
 * - take-photo: Represents the existing camera capture flow (special type for ordering)
 * - restart: Explicitly restarts the entire journey from the first onboarding step
 */
export enum CustomPageType {
  WHO_ARE_YOU = 'who-are-you',  // Data collection page
  ACCEPT = 'accept',            // Consent/terms page
  CTA = 'cta',                  // Call to action page
  TAKE_PHOTO = 'take-photo',    // Photo capture step (for ordering only)
  RESTART = 'restart',          // Restart the full experience from the beginning
}

/**
 * Custom Page Configuration
 * Defines a single page in the event flow
 * 
 * Why order field:
 * - Enables drag-and-drop reordering without array manipulation
 * - Survives page additions/deletions
 * - Clear sorting: customPages.sort((a, b) => a.order - b.order)
 * 
 * Why isActive field:
 * - Allows temporarily disabling pages without deleting configuration
 * - Useful for A/B testing or seasonal campaigns
 */
export interface CustomPage {
  pageId: string;              // Unique page identifier (UUID)
  pageType: CustomPageType;    // Type of page
  order: number;               // Display order (0-based, lower = earlier in flow)
  isActive: boolean;           // Whether page is currently enabled
  config: {
    title: string;             // Page heading displayed to user
    description: string;       // Explanatory text shown above form/content
    buttonText: string;        // Next/Continue button label
    // For 'who-are-you' type only
    enableSSOLogin?: boolean;     // Show Google + Facebook login via SSO (default: false)
    enablePseudoReg?: boolean;    // Show name/email form for guest registration (default: true)
    ssoButtonText?: string;       // Heading above Google/Facebook buttons on who-are-you page
    pseudoFormTitle?: string;     // Optional title above name/email form (e.g., "Or continue as guest")
    nameLabel?: string;        // Label for name input (e.g., "Your Name")
    emailLabel?: string;       // Label for email input (e.g., "Your Email")
    namePlaceholder?: string;  // Placeholder for name input (e.g., "Enter your name")
    emailPlaceholder?: string; // Placeholder for email input (e.g., "your.email@example.com")
    // For 'accept' type only
    checkboxText?: string;     // Text displayed next to checkbox (e.g., "I agree to...")
    // For 'cta' type only
    // checkboxText is repurposed as URL to visit
    hasButton?: boolean;       // If false, CTA is end page (no continue button, auto-continues after URL visit)
    visitButtonText?: string;  // Label for visit URL button (e.g., "Visit Now")
    redirectingText?: string;  // Text shown while redirecting (e.g., "Redirecting you shortly...")
    // For 'take-photo' type only
    captureButtonText?: string;  // Label for main capture/save button (e.g., "LOVE IT")
    retryButtonText?: string;    // Label for retry button (e.g., "TRY AGAIN")
    shareNextButtonText?: string; // Label for next button on share screen (e.g., "NEXT")
    /** Share overlay heading (i18n) */
    shareScreenTitle?: string;
    /** Label beside copy icon on share overlay URL row */
    shareCopyLinkButtonText?: string;
    /** Opens public /share/… page in a new tab */
    shareViewPhotoButtonText?: string;
    /** Line above the suggested caption (i18n) */
    shareSuggestedMessageLabel?: string;
    /** Caption for Twitter/WhatsApp etc.; use `{event}` for the event name */
    shareSocialCaptionTemplate?: string;
    changeButtonText?: string;   // Label for change frame button (e.g., "Change")
    successMessage?: string;     // Message shown after successful save (e.g., "Photo saved successfully! You can now share it.")
    showSharePage?: boolean;     // If false, skip share page and show thank you message instead
    skipShareMessage?: string;   // Message shown when share page is skipped (e.g., "Thank you! Your photo has been saved.")
    showFrameOnCapture?: boolean; // If true, show frame overlay during live capture; if false, frame only applied after capture (default: true)
    // Camera prompt customization
    cameraPromptTitle?: string;  // Title shown on camera start screen (e.g., "Ready to capture?")
    cameraPromptDescription?: string; // Description on camera start screen (e.g., "Click to start your camera and take a photo")
    // Error and notification messages
    errorFrameMessage?: string;  // Error when frame fails to apply (e.g., "Failed to apply frame. Please try again.")
    errorSaveMessage?: string;   // Error when save fails (e.g., "Failed to save photo: Please try again.")
    linkCopiedMessage?: string;  // Success when link copied (e.g., "Link copied to clipboard!")
    copyErrorMessage?: string;   // Error when copy fails (e.g., "Failed to copy link. Please copy it manually.")
    saveFirstMessage?: string;   // Warning when trying to share before saving (e.g., "Please save the photo first to get a shareable link.")
    // For 'restart' type only
    restartButtonText?: string;  // Optional dedicated label for restarting from the first page
  };
  createdAt: string;           // ISO 8601 timestamp when page was added
  updatedAt: string;           // ISO 8601 timestamp of last modification
}

/**
 * Event Document Interface
 * Represents a specific event within a partner that uses frames
 * 
 * Why events:
 * - Events need their own frame collections
 * - Enables per-event customization and activation control
 * - Supports event-specific QR codes and sharing
 * - Supports custom page flows for onboarding and thank you pages
 * 
 * Example: "Serie A - AC Milan x AS Roma", "Red Bull Racing - Monaco GP 2025"
 */
export interface Event {
  _id?: ObjectId;                    // MongoDB document ID
  eventId: string;                   // Unique event identifier (UUID)
  name: string;                      // Event name (e.g., "Serie A - AC Milan x AS Roma")
  description?: string;              // Optional event description
  /**
   * Optional path slug on GO_SHORT_HOSTNAMES (e.g. `selfie` → https://go…/selfie → `/capture/{_id}`).
   * Lowercase; unique when set.
   */
  shortUrlSlug?: string | null;
  greatestHitsSlug?: string | null;

  // Partner relationship
  partnerId: string;                 // Reference to parent partner
  partnerName: string;               // Cached partner name for display and filtering
  messmassEventId?: string;          // Cross-ref to the messmass event/project (_id) — shared identity; read by fanmass
  savetheworldEventId?: string;      // Cross-ref to the savetheworld provisioning call — shared identity, idempotency key
  
  // Event details
  eventDate?: string;                // Optional event date (ISO 8601 timestamp)
  location?: string;                 // Optional event location
  isActive: boolean;                 // Whether event is currently active
  tryOn?: {
    enabled: boolean;                // Whether local AI try-on can be requested from capture flows
    setupId?: string | null;         // Optional default try-on setup selected for this event
    allowedLeatherSuitIds?: string[]; // Optional allowlist for the public suit picker
    outfitEnabled?: boolean;         // Whether top+bottom outfit pairing is offered in the capture flow (default false — also the instant, no-deploy kill switch for the feature)
    applyFrameToReturnedResults?: boolean; // Whether Camera should re-apply the selected frame after the try-on worker uploads the generated result
    vettingEnabled?: boolean;        // Whether generated try-on results require admin review before publication
    localAiQualityGateEnabled?: boolean; // Whether local AI pre-vetting triage can auto-screen event try-on results before manual review
    includeApprovedResultsInSlideshows?: boolean; // Legacy/publication flag mirrored from resultSlideshowMode
    resultSlideshowMode?: 'disabled' | 'mixed_with_originals' | 'approved_results_only'; // Event policy for approved try-on slideshow publication
  };
  notifications?: {
    submissionResultEmailEnabled: boolean; // Whether users receive the public result page link after submission
    submissionResultEmailSubject?: string | null; // Optional legacy event-level subject template (fallback)
    submissionResultEmailBody?: string | null; // Optional legacy event-level plain-text body template (fallback)
    submissionResultEmailSubjectAfterSave?: string | null; // Optional event-level subject template for "send after save"
    submissionResultEmailBodyAfterSave?: string | null; // Optional event-level body template for "send after save"
    submissionResultEmailSubjectAfterRelatedPhotosReady?: string | null; // Optional event-level subject template for "send after related photos"
    submissionResultEmailBodyAfterRelatedPhotosReady?: string | null; // Optional event-level body template for "send after related photos"
    submissionResultEmailSubjectAfterTryOnResubmissionApproved?: string | null; // Optional event-level subject template for approved rerun update
    submissionResultEmailBodyAfterTryOnResubmissionApproved?: string | null; // Optional event-level body template for approved rerun update
    submissionResultEmailSenderName?: string | null; // Display name shown in the Resend From header
    termsUrl?: string | null; // Event-specific General Terms and Conditions / Privacy Policy URL for email templates
    submissionResultEmailSendAfterSave: boolean; // Send immediately after submission save
    submissionResultEmailSendAfterRelatedPhotosReady: boolean; // Send when related share photos are available
    submissionResultEmailSendAfterTryOnResubmissionApproved?: boolean; // Send when a resubmitted try-on result is approved
  };
  sharePage?: {
    includeOriginalCapture?: boolean; // Raw camera image before frame composition, when available
    includeCameraResult?: boolean; // Camera result saved by the capture flow, usually with frame
    includeTryOnResult?: boolean; // Approved raw try-on result, when available
    includeFramedTryOnResult?: boolean; // Approved try-on result with Camera frame applied, when available
    includeCheckedInTryOnResult?: boolean; // Approved checked-in try-on result to prioritize on share pages
    showCreateYourOwnButton?: boolean; // Whether the share page displays a "Create Your Own" CTA back to capture
    pendingTryOnMessage?: string | null; // Message shown on share page while requested try-on result is not available
  };
  
  // Frame assignments
  // This array tracks which frames are assigned to this event and their activation status
  // Global and partner frames can be overridden here at event level
  frames: Array<{
    frameId: string;                 // Reference to frame
    isActive: boolean;               // Frame active status at event level (overrides global/partner)
    addedAt: string;                 // ISO 8601 timestamp when frame was added to event
    addedBy?: string;                // Admin user ID who added this frame
  }>;
  
  // Logo assignments
  // Multiple logos can be assigned per scenario
  // If multiple logos for same scenario: random selection on each display
  // If no logos for scenario: no logo shown
  logos: Array<{
    logoId: string;                  // Reference to logo
    scenario: LogoScenario;          // Where/when to display this logo
    order: number;                   // Order for random selection (lower = higher priority)
    isActive: boolean;               // Whether this logo assignment is active
    addedAt: string;                 // ISO 8601 timestamp when logo was added
    addedBy?: string;                // Admin user ID who added this logo
  }>;
  
  // Custom page flow
  // Defines onboarding and thank you pages shown before/after photo capture
  // Pages with order < [Take Photo] order = onboarding pages
  // Pages with order > [Take Photo] order = thank you pages
  // Empty array = default behavior (go straight to photo capture)
  customPages: CustomPage[];         // Array of custom pages (ordered by order field)
  
  // Customization
  loadingText?: string;              // Text shown while event is loading (e.g., "Loading event...")
  logoUrl?: string;                  // Optional event logo URL (imgbb.com) - displayed on capture pages
  showLogo: boolean;                 // Whether to display logo on event pages (default: false)
  
  // Brand colors
  // Used throughout the event experience for consistent branding
  brandColor?: string;               // Primary brand color hex - used for buttons, focus states
  brandBorderColor?: string;         // Border/accent color hex - used for borders, outlines
  visualSettings?: {
    buttonSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; // Event action button size, rendered through GDS/Mantine buttons
  };
  
  // Style inheritance from partner
  // Override flags track whether this event uses partner defaults (child) or custom values (orphan)
  // false/undefined = child (inherits from partner, updates when partner changes)
  // true = orphan (custom values, independent of partner changes)
  brandColorsOverridden?: boolean;   // Whether event has custom brand colors
  framesOverridden?: boolean;        // Whether event has custom frame assignments
  logosOverridden?: boolean;         // Whether event has custom logo assignments
  
  // Statistics
  submissionCount?: number;          // Cached count of submissions for this event
  
  // Admin tracking
  createdBy: string;                 // Admin user ID from SSO who created this event
  createdAt: string;                 // ISO 8601 timestamp with milliseconds UTC
  updatedAt: string;                 // ISO 8601 timestamp with milliseconds UTC
}

// ============================================================================
// LOGOS COLLECTION
// ============================================================================

/**
 * Logo Scenario Type
 * Defines where/when a logo should be displayed
 * 
 * Why four scenarios:
 * - slideshow-transition: Logo shown during slide transitions with fade in/out
 * - onboarding-thankyou: Logo displayed on custom pages (top center above title)
 * - loading-slideshow: Logo shown while slideshow is loading
 * - loading-capture: Logo shown while capture app is loading
 */
export enum LogoScenario {
  SLIDESHOW_TRANSITION = 'slideshow-transition',
  ONBOARDING_THANKYOU = 'onboarding-thankyou',
  LOADING_SLIDESHOW = 'loading-slideshow',
  LOADING_CAPTURE = 'loading-capture',
}

/**
 * Logo Document Interface
 * Represents an uploaded logo that can be assigned to events
 * 
 * Why separate from frames:
 * - Logos have different display rules (scenarios vs overlay)
 * - Logos support multiple per scenario with random selection
 * - Logos have different dimensions and aspect ratios
 * - Simpler management and assignment logic
 */
export interface Logo {
  _id?: ObjectId;                    // MongoDB document ID
  logoId: string;                    // Unique logo identifier (UUID)
  name: string;                      // Human-readable logo name
  description?: string;              // Optional logo description
  imageUrl: string;                  // imgbb.com URL for logo image
  thumbnailUrl: string;              // imgbb.com URL for thumbnail
  width: number;                     // Logo width in pixels
  height: number;                    // Logo height in pixels
  fileSize: number;                  // File size in bytes
  mimeType: string;                  // MIME type (e.g., "image/png")
  
  // Status
  isActive: boolean;                 // Whether logo is available for assignment
  
  // Admin tracking
  createdBy: string;                 // Admin user ID from SSO
  createdAt: string;                 // ISO 8601 timestamp with milliseconds UTC
  updatedAt: string;                 // ISO 8601 timestamp with milliseconds UTC
  
  // Usage statistics
  usageCount?: number;               // Number of events using this logo
  lastUsedAt?: string;               // ISO 8601 timestamp of last use
}

// ============================================================================
// FRAMES COLLECTION
// ============================================================================

/**
 * Frame Document Interface
 * Represents a graphical frame template in the database.
 *
 * This describes what frame documents ACTUALLY contain, verified against every
 * document in the collection and against the only code path that creates one
 * (`app/api/frames/route.ts` POST, which writes exactly these fields). Keep
 * those in agreement: a frame query typed against fields no document has
 * silently returns nothing rather than failing, which is the exact bug this
 * shape replaced.
 *
 * Frames are flat and global — there is no ownership hierarchy, no per-partner
 * activation, and no stored dimensions. Per-event frame selection lives on the
 * event (`Event.frames[]`), not here.
 */
export interface Frame {
  _id?: ObjectId;                    // MongoDB document ID
  frameId: string;                   // Unique frame identifier (UUID)
  name: string;                      // Human-readable frame name
  description: string;               // Operator notes; may be an empty string
  category: string;                  // Grouping label; defaults to 'general' on create
  imageUrl: string;                  // imgbb.com URL for the frame asset
  deleteUrl: string;                 // imgbb.com deletion URL for the asset
  imageId: string;                   // imgbb.com asset identifier
  fileSize: number | null;           // Asset size in bytes; null when imgbb omits it
  mimeType: string;                  // e.g. "image/png"
  isActive: boolean;                 // Whether the frame is offered for selection
  createdBy: string;                 // Admin user ID from SSO
  createdAt: string;                 // ISO 8601 timestamp with milliseconds UTC
  updatedAt: string;                 // ISO 8601 timestamp with milliseconds UTC
}

// ============================================================================
// SUBMISSIONS COLLECTION
// ============================================================================

/**
 * Device Type
 * Identifies the device used for photo capture/upload
 */
export enum DeviceType {
  MOBILE_IOS = 'mobile_ios',
  MOBILE_ANDROID = 'mobile_android',
  DESKTOP = 'desktop',
  TABLET = 'tablet',
  UNKNOWN = 'unknown',
}

/**
 * Submission Method
 * How the photo was provided by the user
 */
export enum SubmissionMethod {
  CAMERA_CAPTURE = 'camera_capture',  // Live camera capture
  FILE_UPLOAD = 'file_upload',        // File uploaded from device
}

/**
 * Submission Status
 * Lifecycle status of the submission
 */
export enum SubmissionStatus {
  PROCESSING = 'processing',    // Image composition in progress
  COMPLETED = 'completed',      // Successfully processed
  FAILED = 'failed',            // Processing failed
  DELETED = 'deleted',          // Soft deleted by user
}

/**
 * User Consent Record
 * Tracks acceptance of terms, GDPR consents, or marketing opt-ins
 * 
 * Why stored per submission:
 * - Legal requirement to track exactly what user agreed to and when
 * - Supports audit trails for GDPR compliance
 * - Links consent to specific submission context
 */
export interface UserConsent {
  pageId: string;              // Reference to customPage that generated this consent
  pageType: 'accept' | 'cta';  // Type of page (for categorization)
  checkboxText: string;        // Exact text user agreed to (immutable record)
  accepted: boolean;           // Always true (required to proceed)
  acceptedAt: string;          // ISO 8601 timestamp when user checked the box
}

export type SubmissionTryOnRequestStatus =
  | 'not_requested'
  | 'requested'
  | 'source_uploaded'
  | 'queued'
  | 'claimed'
  | 'processing'
  | 'uploading_result'
  | 'notifying_camera'
  | 'retry_wait'
  | 'done'
  | 'failed'
  | 'deduplicated'
  | 'enqueue_failed'
  | 'cancelled';

export interface SubmissionTryOnRequestState {
  requested: boolean;
  status: SubmissionTryOnRequestStatus;
  requestedAt?: string | null;
  lastUpdatedAt: string;
  leatherSuitId?: string | null;
  jobId?: string | null;
  sourceImageUrl?: string | null;
  sourceDeleteUrl?: string | null;
  sourceImageId?: string | null;
  resultUrl?: string | null;
  resultDeleteUrl?: string | null;
  resultProvider?: 'imgbb' | 'blob' | null;
  resultMirrorUrl?: string | null;
  reviewStatus?: 'pending_review' | 'approved' | 'rejected' | null;
  shareVisible?: boolean;
  slideshowEligible?: boolean;
  lastError?: string | null;
}

export type TryOnArchiveReason =
  | 'approved'
  | 'manual_reject'
  | 'service_photo'
  | 'quality_rerun_superseded';

export type TryOnIdentityClassificationStatus =
  | 'source_recoverable'
  | 'manual_corrected'
  | 'reviewed_unrecoverable';

export interface TryOnIdentityClassification {
  status: TryOnIdentityClassificationStatus;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reason?: string | null;
}

export interface TryOnModerationArchiveState {
  archived: boolean;
  bucket?: 'approved' | 'rejected' | 'service' | null;
  archivedAt?: string | null;
  archivedBy?: string | null;
  reason?: TryOnArchiveReason | null;
  supersededByJobId?: string | null;
  supersededAt?: string | null;
}

/**
 * Submission Document Interface
 * Represents a user photo submission with complete metadata
 * 
 * Additional onboarding and consent data:
 * - userInfo: Name and email collected from 'who-are-you' pages
 * - consents: Array of acceptances from 'accept' and 'cta' pages
 * 
 * Why store in submission:
 * - All capture session data kept together for easy retrieval
 * - Single query gets complete context
 * - Supports GDPR data export requirements
 * - Maintains audit trail of what user agreed to per submission
 */
export interface Submission {
  _id?: ObjectId;                    // MongoDB document ID
  submissionId: string;              // Unique submission identifier (UUID)
  userId: string;                    // User ID from SSO
  userEmail: string;                 // User email from SSO
  userName?: string | null;          // Cached display name used by share/profile/admin surfaces
  frameId: string;                   // Reference to frame used
  
  // Partner/Event context for gallery organization
  partnerId: string | null;          // Partner ID if submission is from event capture, null for general
  partnerName: string | null;        // Cached partner name for display
  eventIds: string[];                // Array of event IDs where this submission appears (supports reusability)
  eventName: string | null;          // Cached event name for display (primary event)
  
  // Image URLs (all hosted on imgbb.com)
  imageUrl?: string;                 // Legacy/current primary public image URL used by share/slideshow/admin surfaces
  previewImageUrl?: string | null;   // Smaller downscaled imgbb image for grid/list thumbnails; fall back to imageUrl/finalImageUrl when absent
  deleteUrl?: string;                // ImgBB delete URL when the image is managed by Camera
  originalImageUrl: string;          // User's original photo
  finalImageUrl: string;             // Composed photo with frame
  eventId?: string | null;           // Legacy/current single-event mirror for filtering
  frameName?: string | null;         // Cached frame name used by admin listings
  frameCategory?: string | null;     // Cached frame category used by admin filters
  imageId?: string | null;           // ImgBB image id when returned by upload API
  fileSize?: number | null;          // Current top-level file size mirror used by some admin tools
  mimeType?: string | null;          // Current top-level mime type mirror used by some admin tools
  submissionKind?: 'original' | 'tryon_result'; // Publication kind for originals vs derived AI outputs
  sourceSubmissionId?: string | null; // Mongo _id string of the originating submission for derived try-on results
  sourceJobId?: string | null;       // Queue job that produced the derived try-on result
  tryOnLeatherSuitId?: string | null; // Canonical leather suit selection used for generation
  tryOnPipeline?: string | null;     // Processor pipeline name
  tryOnPipelineVersion?: string | null; // Processor pipeline version for debugging/audit
  tryOnRequest?: SubmissionTryOnRequestState | null; // Original-submission try-on intent and lifecycle tracking
  reviewStatus?: 'pending_review' | 'approved' | 'rejected'; // Moderation status for generated try-on results
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNotes?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  isShareVisible?: boolean;          // Public share-page publication flag
  isSlideshowEligible?: boolean;     // Slideshow playlist eligibility flag
  tryOnModerationArchive?: TryOnModerationArchiveState | null; // Review-queue archive state for try-on results only
  
  // Submission details
  method: SubmissionMethod;          // Camera capture or file upload
  status: SubmissionStatus;          // Processing status
  
  // User information collected from onboarding pages
  // Only present if event has 'who-are-you' pages
  // Stored here for GDPR compliance and easy data export
  userInfo?: {
    name?: string;                   // User's name from onboarding form
    email?: string;                  // User's email from onboarding form
    collectedAt: string;             // ISO 8601 timestamp when data was collected
  };
  
  // Consent records from accept/CTA pages
  // Empty array if no consent pages in event flow
  // Each consent is immutable record of what user agreed to
  consents: UserConsent[];           // Array of user consent acceptances
  
  // Comprehensive metadata for tracking and analytics
  metadata: {
    // Device information
    deviceType: DeviceType;
    deviceInfo?: string;             // User agent string
    browserInfo?: string;            // Browser name and version
    
    // Location data (if available and user consented)
    ipAddress?: string;              // User's IP address
    country?: string;                // Derived from IP
    city?: string;                   // Derived from IP
    geolocation?: {                  // GPS coordinates if available
      latitude: number;
      longitude: number;
      accuracy: number;
    };
    
    // Image technical details
    originalWidth: number;           // Original photo width
    originalHeight: number;          // Original photo height
    originalFileSize: number;        // Original file size in bytes
    originalMimeType: string;        // e.g., "image/jpeg"
    finalWidth: number;              // Final composed image width
    finalHeight: number;             // Final composed image height
    finalFileSize: number;           // Final file size in bytes
    
    // Processing details
    processingTimeMs?: number;       // Time taken to process (milliseconds)
    compositionEngine?: string;      // "canvas-api" or other
    tryOnRawResultUrl?: string | null; // Raw worker result URL when Camera stores a framed try-on derivative
    
    // Email delivery
    emailSent: boolean;              // Whether email was sent
    emailSentAfterSave?: boolean;    // Whether email was sent from "after save" policy
    emailSentAfterRelatedPhotos?: boolean; // Whether email was sent from "after related photos" policy
    emailSentAfterTryOnResubmissionApproved?: boolean; // Whether update email was sent for an approved rerun result
    emailSendAfterRelatedPending?: boolean; // Whether related-photo email is waiting on publish readiness
    emailSentAt?: string;            // ISO 8601 timestamp
    emailRecipient?: string;         // Normalized recipient address
    emailProvider?: string;          // Delivery provider, e.g. "resend"
    emailMessageId?: string | null;  // Provider message id when available
    emailSkippedAt?: string;         // ISO 8601 timestamp if delivery was skipped
    emailSkipReason?: string;        // Why delivery was skipped
    emailFailedAt?: string;          // ISO 8601 timestamp if delivery failed
    emailError?: string;             // Error message if email failed
    shareUrl?: string;               // Public share URL emailed to the user
    tryOnIdentityClassification?: TryOnIdentityClassification;
  };
  
  // Sharing and engagement
  shareCount: number;                // Number of times shared
  downloadCount: number;             // Number of times downloaded
  lastSharedAt?: string;             // ISO 8601 timestamp
  
  // Archive and visibility control (replaces soft delete)
  isArchived: boolean;               // Admin-level archive flag (hidden from all views except archived page)
  archivedAt?: string;               // ISO 8601 timestamp when archived
  archivedBy?: string;               // Admin user ID who archived this submission
  
  hiddenFromPartner: boolean;        // Hidden from partner-level views (but not deleted)
  hiddenFromEvents: string[];        // Array of event IDs where this submission is hidden
  
  // Slideshow tracking for playlist generation
  // Tracks how many times this submission has been displayed in each slideshow
  // Key = slideshowId, Value = { count, lastPlayedAt }
  slideshowPlays?: Record<string, {
    count: number;                   // Number of times shown in this specific slideshow
    lastPlayedAt: string;            // ISO 8601 timestamp of last play in this slideshow
  }>;
  
  // Global aggregates (computed from slideshowPlays for backward compatibility)
  playCount?: number;                // Total plays across all slideshows (default: 0)
  lastPlayedAt?: string;             // ISO 8601 timestamp of most recent play
  
  // Timestamps
  createdAt: string;                 // ISO 8601 timestamp with milliseconds UTC
  updatedAt: string;                 // ISO 8601 timestamp with milliseconds UTC
  tryOnJobs?: SubmissionTryOnLink[]; // Optional try-on jobs linked back to this submission
}

export type TryOnModerationAction =
  | 'approve'
  | 'reject'
  | 'service'
  | 'great'
  | 'remove_great'
  | 'rerun'
  | 'reframe'
  | 'restore'
  | 'remove';

export interface TryOnModerationStateSnapshot {
  reviewStatus?: 'pending_review' | 'approved' | 'rejected' | null;
  archiveBucket?: 'approved' | 'rejected' | 'service' | null;
  archived?: boolean | null;
  shareVisible?: boolean | null;
  slideshowEligible?: boolean | null;
  isGreat?: boolean | null;
  isService?: boolean | null;
  archiveReason?: string | null;
  archiveSupersededByJobId?: string | null;
  archiveSupersededAt?: string | null;
}

export interface TryOnModerationEvent {
  _id?: ObjectId;
  eventId: string;
  resultSubmissionId: string;
  sourceSubmissionId: string | null;
  sourceJobId: string | null;
  action: TryOnModerationAction;
  actorEmail: string;
  createdAt: string;
  previousState: TryOnModerationStateSnapshot;
  nextState: TryOnModerationStateSnapshot;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// TRY-ON COLLECTIONS
// ============================================================================

// WHAT: What kind of garment this is, and (for upper-body pieces) how the
//     model should treat the wearer's arms.
// WHY: This system originally shipped for exactly one product (MotoGP
//     racing leathers) with a single hardcoded category. 'top'/'bottom'
//     are deliberately two separate piece types rather than a combined
//     'soccer_kit' value - a kit is just a top + a bottom selected
//     together at render time (two sequential renders, composited), not a
//     new garment shape of its own.
export type GarmentType = 'motorsport_suit' | 'jersey' | 'top' | 'bottom';

// WHAT: Only meaningful for 'jersey'/'top' garments. 'sleeveless' tells the
//     try-on pipeline to synthesize bare skin on the arms rather than leave
//     whatever sleeve was in the source photo untouched.
export type SleeveStyle = 'sleeveless' | 'short_sleeve' | 'long_sleeve';

export interface LeatherSuit {
  _id?: ObjectId;
  leatherSuitId: string;
  name: string;
  description?: string | null;
  garmentType: GarmentType;
  sleeveStyle?: SleeveStyle | null;
  assetKey: string;
  assetVersion: number;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  deleteUrl?: string | null;
  imageId?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  assetRelativePath?: string | null;
  previewUrl?: string | null;
  sourceImageUrl?: string | null;
  active: boolean;
  usageCount?: number;
  createdBy?: string;
  metadata?: {
    pose?: 'front_a_pose';
    notes?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export type TryOnJobStatus =
  | 'queued'
  | 'claimed'
  | 'processing'
  | 'uploading_result'
  | 'notifying_camera'
  | 'retry_wait'
  | 'done'
  | 'failed'
  | 'cancelled';

export type TryOnJobStage =
  | 'queued'
  | 'claimed'
  | 'downloading_input'
  | 'resolving_suit'
  | 'running_tryon'
  | 'uploading_result'
  | 'uploaded_result'
  | 'notifying_camera'
  | 'done'
  | 'failed'
  | 'cancelled';

export type TryOnSetupSource = 'job.assigned' | 'camera.last' | 'global.default' | 'legacy';

export interface TryOnSetupConfig {
  processing_profile?: string;
  processingProfile?: string;
  category?: string;
  sleeve_length?: string;
  pant_length?: string;
  resolution?: string;
  steps?: number;
  guidance?: number;
  show_mask?: boolean;
  mask_sharpness?: number;
  mask_padding?: number;
  detail_boost?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export interface TryOnSetup {
  _id?: ObjectId;
  setupId: string;
  name: string;
  description?: string | null;
  cameraId?: string | null;
  active: boolean;
  isDefault: boolean;
  rank: number;
  config?: TryOnSetupConfig;
  // WHAT: garment types this setup is the submit-time default for. WHY: a
  // setup's parameters are shaped around a garment silhouette (a full-body
  // leather-suit prompt painted fake sleeves onto FIBA's short-sleeve
  // jerseys), so the right default follows the garment, not the event. More
  // specific beats more general: this wins over the event's generic
  // tryOn.setupId when the guest made no explicit choice.
  defaultForGarmentTypes?: GarmentType[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface TryOnSetupPreference {
  _id?: ObjectId;
  cameraId: string;
  setupId: string;
  updatedAt: string;
  updatedBy?: string | null;
  updatedByEvent?: string | null;
}

export interface TryOnJobSource {
  app: 'camera';
  submissionId: string;
  imageUrl: string;
  cameraId?: string | null;
  eventId?: string | null;
  eventMongoId?: string | null;
  partnerId?: string | null;
  userId?: string | null;
}

export interface TryOnJobRequest {
  leatherSuitId: string;
  setupId?: string | null;
  rerunOfJobId?: string | null;
  // Snapshot of the garment's own type/sleeve at job-creation time, so a
  // later edit to the catalog entry can't retroactively change how an
  // already-queued (or already-rendered) job was supposed to look. The
  // try-on worker resolves render category/mask mode from these
  // (try-on#37/#38).
  garmentType?: GarmentType | null;
  sleeveStyle?: SleeveStyle | null;
  // Two-piece outfit (try-on#39's contract, TRYON_ATLAS_CONTRACT.md):
  // presence makes this an outfit job — leatherSuitId is the 'top' piece,
  // this is the 'bottom'. The worker renders two sequential passes and
  // publishes one result; it re-validates both pieces' types at claim time.
  outfitBottomLeatherSuitId?: string | null;
}

export interface TryOnJobResolvedSetup {
  setupId: string;
  setupName: string;
  setupProfile: string | null;
  setupSource: TryOnSetupSource;
}

export interface TryOnJobProcessingState {
  workerId?: string | null;
  claimedAt?: string | null;
  leaseExpiresAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  attemptCount: number;
  nextAttemptAt: string;
  lastHeartbeatAt?: string | null;
  resolvedSetup?: TryOnJobResolvedSetup;
}

export interface TryOnJobResult {
  publicResultUrl?: string | null;
  imgbbDeleteUrl?: string | null;
  provider?: 'imgbb' | 'blob' | null;
  imgbbMirrorUrl?: string | null;
}

export interface TryOnJobError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

export interface TryOnJob {
  _id?: ObjectId;
  jobId: string;
  requestHash: string;
  status: TryOnJobStatus;
  stage: TryOnJobStage;
  pipeline: 'motogp_leather_magic';
  pipelineVersion: string;
  source: TryOnJobSource;
  request: TryOnJobRequest;
  processing: TryOnJobProcessingState;
  result: TryOnJobResult;
  error: TryOnJobError;
  createdAt: string;
  updatedAt: string;
}

export interface TryOnWorkerHeartbeat {
  _id?: ObjectId;
  workerId: string;
  workerRunning: boolean;
  currentJobId?: string | null;
  lastLoopAt?: string | null;
  lastHeartbeatAt?: string | null;
  pollIntervalSeconds?: number | null;
  enabled?: boolean | null;
  updatedAt: string;
  createdAt?: string;
}

export interface SubmissionTryOnLink {
  jobId: string;
  leatherSuitId: string;
  status: TryOnJobStatus;
  resultUrl?: string | null;
  resultSubmissionId?: string | null;
  reviewStatus?: 'pending_review' | 'approved' | 'rejected' | null;
  shareVisible?: boolean;
  slideshowEligible?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SLIDESHOWS COLLECTION
// ============================================================================

/**
 * Slideshow Document Interface
 * Represents a 16:9 slideshow configuration for an event
 * 
 * Why slideshows:
 * - Event organizers need to display submissions on screens during events
 * - Smart playlist algorithm ensures all submissions get displayed fairly
 * - Supports multiple slideshow instances per event for different screens
 * 
 * Playlist Logic:
 * - Always selects the 5 least-played submissions (by playCount, then createdAt)
 * - Groups submissions by aspect ratio: 16:9 (full screen), 1:1 (2x1 mosaic), 9:16 (3x1 mosaic)
 * - Skips 1:1 and 9:16 images if not enough to create complete mosaics
 * - Updates playCount and lastPlayedAt after each display
 * 
 * Display Format:
 * - 16:9 canvas at 1920x1080px
 * - 16:9 images: Full screen display
 * - 1:1 images: 2 images side-by-side (800x800px each) with equal padding
 * - 9:16 images: 3 images side-by-side (540x960px each) with equal padding
 */
export interface Slideshow {
  _id?: ObjectId;                    // MongoDB document ID
  slideshowId: string;               // Unique slideshow identifier (UUID)
  eventId: string;                   // Reference to parent event
  eventName: string;                 // Cached event name for display
  name: string;                      // User-defined slideshow name (e.g., "Main Screen", "VIP Lounge")
  
  // Slideshow settings
  isActive: boolean;                 // Whether slideshow is currently active
  transitionDurationMs: number;      // Duration each slide is displayed (milliseconds, default: 5000)
  fadeDurationMs: number;            // Duration of fade transition (milliseconds, default: 1000)
  
  // Rolling buffer settings for infinite smooth playback
  /** Upcoming slides prefetched behind the one on screen (default: 10 → 11 FIFO slots with current). */
  bufferSize: number;
  refreshStrategy: 'continuous' | 'batch'; // How to refresh playlist (default: 'continuous')
  /** Stop after one pass through the buffer, or rotate indefinitely (default: loop) */
  playMode?: 'once' | 'loop';
  /** Submission order before mosaic grouping (default: fixed = least-played sort) */
  orderMode?: 'fixed' | 'random';
  /** Source selection policy for original captures vs approved try-on outputs. */
  submissionSourceMode?: 'originals_only' | 'approved_tryon_only' | 'originals_and_approved_tryon';
  /** Submission _ids (as strings) manually pinned into this slideshow's rotation, in addition to whatever submissionSourceMode already matches. */
  manualSubmissionIds?: string[];

  /** Failover gradient (top-right → bottom-left): CSS hex colors */
  backgroundPrimaryColor?: string;
  backgroundAccentColor?: string;
  /** Optional image between gradient and slides (uploaded by admin) */
  backgroundImageUrl?: string | null;
  /** Letterbox stage in container vs crop to cover (browser or layout cell) */
  viewportScale?: 'fit' | 'fill';
  /**
   * Stage width ÷ height (e.g. 16/9, 4/3, 1, 9/16). When omitted or null, event default applies
   * (16:9 unless overridden here).
   */
  stageAspect?: number | null;
  
  // Admin tracking
  createdBy: string;                 // Admin user ID from SSO who created this slideshow
  createdAt: string;                 // ISO 8601 timestamp with milliseconds UTC
  updatedAt: string;                 // ISO 8601 timestamp with milliseconds UTC
}

// ============================================================================
// SLIDESHOW LAYOUTS COLLECTION
// ============================================================================

/**
 * One region on a grid (CardMass-style tile union). Each area plays one slideshow.
 */
export interface SlideshowLayoutArea {
  /** Stable region id; public layout player sends this as playlist `instanceKey` for independent random order per cell */
  id: string;
  label: string;
  /** Tile ids "r-c" covering this region; must not overlap other areas */
  tiles: string[];
  /** Preview color in admin builder (optional) */
  color?: string;
  slideshowId: string | null;
  /** Phase offset so duplicate slideshowIds in one layout show different slides */
  delayMs: number;
  /** FIT = contain, FILL = cover; aspect ratio always preserved */
  objectFit: 'contain' | 'cover';
}

/**
 * Composite videowall: multiple cells, each hosting an existing slideshow config.
 */
export interface SlideshowLayout {
  _id?: ObjectId;
  layoutId: string;
  eventId: string;
  eventName: string;
  name: string;
  rows: number;
  cols: number;
  /** Each grid cell is uw:uh (default 16:9); outer videowall = (cols×uw):(rows×uh) */
  cellAspect?: SlideshowLayoutCellAspect;
  areas: SlideshowLayoutArea[];
  /** Optional outer frame CSS (background-* only), same idea as CardMass boards */
  background?: string;
  /**
   * Public `/slideshow-layout/...` always scales the whole grid to fit (contain). API save normalizes to `fit`.
   * Type allows legacy `fill` in old documents; not used for the composite player.
   */
  viewportScale?: 'fit' | 'fill';
  /** Flex alignment of rigid grid in viewport (Tailwind items- / justify- utilities on public page) */
  alignVertical?: 'top' | 'middle' | 'bottom';
  alignHorizontal?: 'left' | 'center' | 'right';
  /** Letterbox safety gradient corners (#RRGGBB); empty → defaults like single slideshow */
  safetyPrimaryColor?: string;
  safetyAccentColor?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type NewSlideshowLayout = Omit<SlideshowLayout, '_id'>;

// ============================================================================
// LANDING PAGES COLLECTION
// ============================================================================

export type LandingPageTargetType = 'slideshow' | 'layout';

/**
 * Public experience landing page for an event. Today it embeds either one slideshow or one slideshow layout,
 * while optional CTA metadata can route users into related app flows such as capture.
 */
export interface LandingPage {
  _id?: ObjectId;
  landingPageId: string;
  eventMongoId: string;
  eventId: string;
  eventName: string;
  slug: string;
  title?: string | null;
  description?: string | null;
  logoId?: string | null;
  logoUrl?: string | null;
  qrCodeImageUrl?: string | null;
  url?: string | null;
  urlButtonText?: string | null;
  termsMarkdown?: string | null;
  termsFileName?: string | null;
  privacyMarkdown?: string | null;
  privacyFileName?: string | null;
  backgroundColor?: string | null;
  titleColor?: string | null;
  descriptionColor?: string | null;
  qrTitleColor?: string | null;
  cookiesTitleColor?: string | null;
  cookiesBodyColor?: string | null;
  legalTitleColor?: string | null;
  legalLinkTextColor?: string | null;
  buttonColor?: string | null;
  buttonTextColor?: string | null;
  customCssPresetId?: string | null;
  customCssClassName?: string | null;
  customCss?: string | null;
  cookieConsentEnabled: boolean;
  targetType: LandingPageTargetType;
  targetId: string;
  targetName: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LandingPageCssPreset {
  _id?: ObjectId;
  presetId: string;
  name: string;
  className: string;
  css: string;
  isSystem: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PARTNER USER ACCESS COLLECTION
// ============================================================================

export type PartnerAppKey = 'events';
export type PartnerAccessRole = 'viewer' | 'manager' | 'admin';

/**
 * Partner-scoped access assignment.
 * Identity still comes from SSO / Camera session, while this collection stores tenant-level permissions.
 */
export interface PartnerUserAccess {
  _id?: ObjectId;
  accessId: string;
  partnerId: string;
  partnerName: string;
  userId?: string | null;
  userEmail: string;
  userName?: string | null;
  appKey: PartnerAppKey;
  role: PartnerAccessRole;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// USERS CACHE COLLECTION (Optional)
// ============================================================================

/**
 * User Cache Document Interface
 * Optional cache of SSO user data to reduce API calls to SSO service
 * 
 * Why cache:
 * - Reduces load on SSO service
 * - Improves response time for user profile pages
 * - Provides data availability if SSO service is temporarily unavailable
 * 
 * Cache strategy:
 * - TTL: 24 hours (refresh daily)
 * - Update on user login
 * - Fallback to SSO API if cache miss
 */
export interface UserCache {
  _id?: ObjectId;                    // MongoDB document ID
  userId: string;                    // User ID from SSO (unique index)
  email: string;                     // User email
  name?: string;                     // User display name
  role?: string;                     // User role (e.g., "admin", "user")
  
  // SSO session info
  lastLoginAt?: string;              // ISO 8601 timestamp
  
  // Cache metadata
  cachedAt: string;                  // ISO 8601 timestamp when cached
  lastSyncAt: string;                // ISO 8601 timestamp of last SSO sync
  syncCount: number;                 // Number of times synced
}

// ============================================================================
// HELPER TYPES AND UTILITIES
// ============================================================================

/**
 * Omit MongoDB _id for insert operations
 */
export type NewPartner = Omit<Partner, '_id'>;
export type NewEvent = Omit<Event, '_id'>;
export type NewFrame = Omit<Frame, '_id'>;
export type NewSubmission = Omit<Submission, '_id'>;
export type NewUserCache = Omit<UserCache, '_id'>;
export type NewSlideshow = Omit<Slideshow, '_id'>;
export type NewPartnerUserAccess = Omit<PartnerUserAccess, '_id'>;

/**
 * Generate ISO 8601 timestamp with milliseconds in UTC
 * Format: YYYY-MM-DDTHH:MM:SS.sssZ
 */
export function generateTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Generate a simple unique ID (UUID v4 alternative)
 * Uses crypto.randomUUID() if available, falls back to timestamp-based ID
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random string
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
