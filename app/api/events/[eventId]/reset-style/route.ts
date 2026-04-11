/**
 * Event Reset Style API
 * 
 * POST: Reset specific style field to partner default (admin only)
 */

import { NextRequest } from 'next/server';
import {
  withErrorHandler,
  requireAdmin,
  validateRequiredFields,
  apiSuccess,
  apiBadRequest,
} from '@/lib/api';
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
 * 2. Sets override flag to false (child behavior)
 * 3. Applies partner's current default values
 * 
 * Use case: User wants to revert custom changes and re-inherit from partner
 */
export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) => {
  // Check authentication and authorization
  const session = await requireAdmin();

  const { eventId } = await params;
  
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
