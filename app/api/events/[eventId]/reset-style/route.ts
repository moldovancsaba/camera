/**
 * Event Reset Style API
 * 
 * POST: Reset specific style field to partner default (global admin only)
 */

import { NextRequest } from 'next/server';
import {
  withErrorHandler,
  requireAuth,
  validateRequiredFields,
  apiSuccess,
  apiBadRequest,
} from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { connectToDatabase } from '@/lib/db/mongodb';
import { resetEventStyleToDefault } from '@/lib/db/events';

/**
 * POST /api/events/[eventId]/reset-style
 * Reset event style field to inherit from partner default
 * 
 * Required fields in request body:
 * - styleField: 'brandColors' | 'frames' | 'logos'
 * 
 * This endpoint:
 * 1. Clears custom values for the specified style field
 * 2. Sets the override flag to false so the event inherits partner defaults again
 * 3. Applies partner's current default values
 * 
 * Use case: User wants to revert custom changes and re-inherit from partner
 */
export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) => {
  const session = await requireAuth();
  const { eventId } = await params;
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, eventId, 'manager');
  
  // Parse request body
  const body = await request.json();
  const { styleField } = body;

  // Validate required fields
  validateRequiredFields(body, ['styleField']);

  // Validate styleField value
  const validFields = ['brandColors', 'frames', 'logos'];
  if (!validFields.includes(styleField)) {
    throw apiBadRequest(
      `Invalid styleField. Must be one of: ${validFields.join(', ')}`
    );
  }

  // Reset style to partner default
  const updatedEvent = await resetEventStyleToDefault(eventId, styleField);

  return apiSuccess({
    event: updatedEvent,
    message: `Successfully reset ${styleField} to partner default`,
  });
});
