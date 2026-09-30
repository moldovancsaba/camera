/**
 * Logo Upload API
 *
 * POST: Upload event/partner logo (Vercel Blob primary, imgbb best-effort mirror)
 *
 * Why this exists:
 * - Client-side code cannot access IMGBB_API_KEY environment variable
 * - This server-side route securely handles image uploads for admin forms
 */

import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongodb';
import { uploadImage } from '@/lib/imgbb/upload';
import { isGlobalAdminSession, listSessionPartnerAssignments } from '@/lib/partners/authorization';
import {
  withErrorHandler,
  requireAuth,
  apiCreated,
  apiBadRequest,
  apiError,
  apiForbidden,
  checkRateLimit,
  RATE_LIMITS,
} from '@/lib/api';

// WHAT: Largest decoded image this route accepts (4 MB), plus the matching
//     cap on the JSON request body that carries it as base64.
// WHY: Logos and QR codes are small. Vercel already refuses request bodies
//     over 4.5 MB (about 3.3 MB of decoded image), so on Vercel this never
//     refuses an upload that works today; it bounds memory and sharp work
//     wherever that platform limit does not apply. base64 inflates by 4/3,
//     and 64 KB covers the JSON envelope and the optional name.
const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 64 * 1024;

function logoTooLarge() {
  return apiError(`Image must be under ${MAX_LOGO_BYTES / 1024 / 1024} MB`, 413);
}

/**
 * WHAT: Allows global admins and partner-scoped users holding an active
 *     Events manager/admin assignment; everyone else gets 403.
 * WHY: requireAuth alone admitted every SSO account, including guest capture
 *     sessions (appRole 'none') and plain 'user' accounts, which made this
 *     free public image hosting. The callers are the event create/edit forms
 *     and the per-event landing-page editor, which partner Events managers
 *     may use (the events and landing-pages APIs admit them at 'manager', and
 *     the sibling gallery-upload route does the same), so global-admin-only
 *     would break that designed path.
 */
async function assertCanUploadLogo(session: Session): Promise<void> {
  if (session.appAccess === false) {
    throw apiForbidden('No access to this app');
  }
  if (isGlobalAdminSession(session)) {
    return;
  }

  const db = await connectToDatabase();
  const assignments = await listSessionPartnerAssignments(db, session);
  const isEventsManager = assignments.some(
    (assignment) =>
      assignment.isActive &&
      assignment.appKey === 'events' &&
      (assignment.role === 'manager' || assignment.role === 'admin')
  );
  if (!isEventsManager) {
    throw apiForbidden('Admin or partner Events manager access is required');
  }
}

/**
 * POST /api/upload-logo
 * Upload a logo image
 *
 * Body: { imageData: string (base64 or data URL, max 4 MB decoded), name?: string }
 * Returns: 201 { imageUrl, thumbnailUrl, deleteUrl, imageId, fileSize, mimeType }
 * Errors: 401 no session, 403 not admin / partner Events manager,
 *         429 rate limited, 413 image too large, 400 missing image data
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.UPLOAD);
  await assertCanUploadLogo(session);

  // WHAT: Reject an oversized body from its declared length before parsing.
  // WHY: request.json() would otherwise buffer the whole payload first.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw logoTooLarge();
  }

  const body = await request.json();
  const { imageData, name } = body;

  if (!imageData || typeof imageData !== 'string') {
    throw apiBadRequest('Image data is required');
  }

  // Extract base64 data (remove data:image/png;base64, prefix if present)
  const base64Data = imageData.includes(',')
    ? imageData.split(',')[1]
    : imageData;

  // WHAT: Size check on the decoded bytes, without decoding.
  // WHY: Covers bodies sent without a Content-Length (chunked transfer).
  if (Buffer.byteLength(base64Data, 'base64') > MAX_LOGO_BYTES) {
    throw logoTooLarge();
  }

  // Upload with optional custom name
  const uploadResult = await uploadImage(base64Data, {
    name: typeof name === 'string' && name.trim() ? name : `logo-${Date.now()}`,
  });

  return apiCreated({
    imageUrl: uploadResult.imageUrl,
    thumbnailUrl: uploadResult.thumbnailUrl,
    deleteUrl: uploadResult.deleteUrl,
    imageId: uploadResult.imageId,
    fileSize: uploadResult.fileSize,
    mimeType: uploadResult.mimeType,
  });
});
