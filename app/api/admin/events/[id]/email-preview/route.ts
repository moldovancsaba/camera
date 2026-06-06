import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type Event, type Submission } from '@/lib/db/schemas';
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  requireAdmin,
  withErrorHandler,
} from '@/lib/api';
import {
  buildSubmissionEmailPreviewContext,
  validateSubmissionEmailTemplate,
  validateSubmissionEmailTemplateMatrix,
  type SubmissionEmailTemplateType,
} from '@/lib/email/submission-template-preview';
import { getConfiguredSiteUrl } from '@/lib/site-url';

const TEMPLATE_TYPES = new Set(['after_save', 'after_related', 'after_tryon_resubmission_approved']);

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    context?: { params?: Promise<{ id: string }> }
  ) => {
    await requireAdmin(request);

    const { id } = await context!.params!;
    if (!ObjectId.isValid(id)) {
      throw apiBadRequest('Invalid event id');
    }

    const body = await request.json().catch(() => ({})) as {
      templateType?: string;
      sampleSubmissionId?: string;
    };
    const templateType = typeof body.templateType === 'string' ? body.templateType.trim() : '';
    if (templateType && !TEMPLATE_TYPES.has(templateType)) {
      throw apiBadRequest('Invalid templateType');
    }

    const db = await connectToDatabase();
    const event = await db.collection<Event>(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
    if (!event) {
      throw apiNotFound('Event not found');
    }

    let sampleSubmission: Submission | null = null;
    if (typeof body.sampleSubmissionId === 'string' && ObjectId.isValid(body.sampleSubmissionId)) {
      sampleSubmission = await db
        .collection<Submission>(COLLECTIONS.SUBMISSIONS)
        .findOne({ _id: new ObjectId(body.sampleSubmissionId) });
    }

    const baseUrl = getConfiguredSiteUrl();
    const contextPayload = buildSubmissionEmailPreviewContext({
      event,
      submission: sampleSubmission,
      baseUrl,
    });
    const validations = templateType
      ? [
          validateSubmissionEmailTemplate({
            type: templateType as SubmissionEmailTemplateType,
            event,
            context: contextPayload,
          }),
        ]
      : validateSubmissionEmailTemplateMatrix({
          event,
          submission: sampleSubmission,
          baseUrl,
        });

    const failures = validations.filter((validation) => !validation.valid);
    if (failures.length > 0) {
      console.warn('[email] Event template preview validation failed', {
        eventId: event.eventId,
        eventMongoId: id,
        templateTypes: failures.map((failure) => failure.type),
        missingValues: failures.flatMap((failure) => failure.missingValues),
        missingPlaceholders: failures.flatMap((failure) => failure.missingPlaceholders),
      });
    }

    return apiSuccess({
      eventId: event.eventId,
      eventMongoId: id,
      context: contextPayload,
      validations,
    });
  }
);
