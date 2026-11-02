/**
 * Event library upload (camera#361): POST a file as an item that belongs to this event (`scope: 'event'`). It is assigned to the event at once
 * (the event now has its own list, so partner changes no longer replace it) and no other event can take it. For frame uploads, `name` is the
 * chooser label; optional `frameMessageMode` (`none`, `existing`, `new`) and `frameMessage` select or create the event-owned text printed on the photo.
 * An image is not assigned (camera#368): it joins the event's images library, which the picture fields choose from. Multipart: `kind`, `file`, `name`,
 * `description?`, `category?`; for a logo also `scenario?` (where it is shown, `onboarding-thankyou` when none is sent; camera#367), or `slot` (camera#419):
 * the logo slot it joins (`logo` or a place of use), on the slot model, instead of the old list; no scenario is then needed.
 * Events managers of the partner and global admins.
 */

import { NextRequest } from 'next/server';
import { Document, ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiBadRequest, apiCreated, apiForbidden, apiNotFound } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { KIND_META, isAssignedKind, parseKind } from '@/lib/library/kinds';
import { createLibraryItem } from '@/lib/library/upload';
import { itemView } from '@/lib/library/db';
import { DEFAULT_UPLOAD_SCENARIO, LOGO_SCENARIOS, isLogoScenario } from '@/lib/library/logos';
import { LOGO_SLOT_IDS } from '@/lib/slots/logo';
import { addLogoToEventSlot } from '@/lib/slots/logo-store';
import { DEFAULT_UPLOAD_MESSAGE_AREA } from '@/lib/frame/message-area';
import { DEFAULT_FRAME_MESSAGES } from '@/lib/frame/messages';
import { refreshFrameDesign } from '@/lib/frame/sync';
import { generateFrameVariants } from '@/lib/frame/variants';
import { associateUploadedFrameMessage, prepareUploadMessage } from '@/lib/frame/upload-message';

export const maxDuration = 60;

export const POST = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ eventId: string }> }) => {
  const session = await requireAuth();
  const { eventId } = await context.params;
  if (!ObjectId.isValid(eventId)) throw apiBadRequest('Invalid event ID format');
  const form = await request.formData();
  const kind = parseKind(form.get('kind'));
  if (!kind) throw apiBadRequest('kind must be frames, logos or images');
  // A logo is assigned to one scenario at once; a bad scenario is refused before the file is stored.
  // On the slot model a logo joins a slot (the event's logo or a place of use) and no scenario is needed (camera#419).
  const sentSlot = kind === 'logos' ? form.get('slot') : null;
  const slot = typeof sentSlot === 'string' && sentSlot ? sentSlot : null;
  if (slot && !LOGO_SLOT_IDS.includes(slot)) throw apiBadRequest(`slot must be one of: ${LOGO_SLOT_IDS.join(', ')}`);
  const sentScenario = form.get('scenario');
  const scenario = kind === 'logos' ? (sentScenario === null || sentScenario === '' ? DEFAULT_UPLOAD_SCENARIO : sentScenario) : null;
  if (kind === 'logos' && !slot && !isLogoScenario(scenario)) throw apiBadRequest(`scenario must be one of: ${LOGO_SCENARIOS.map((s) => s.id).join(', ')}`);

  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
  if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
  let event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
  if (!event) throw apiNotFound('Event');

  // Event message wording belongs to this event, so an upload can attach an
  // existing message or add a new one. Parent-level uploads stay reusable and
  // do not capture text that belongs to any one event.
  const messageMode = kind === 'frames' ? form.get('frameMessageMode') : null;
  const messageValue = kind === 'frames' ? form.get('frameMessage') : null;
  let preparedMessage = null;
  if (messageMode !== null && messageMode !== 'none' && messageMode !== '') {
    if (messageMode !== 'existing' && messageMode !== 'new') throw apiBadRequest('Choose an existing event message, add a new one, or leave the frame without a message.');
    if (!event.frameDesign || !(event.frameDesign as { context?: unknown }).context) {
      const refreshed = await refreshFrameDesign(db, event);
      event = { ...event, frameDesign: refreshed.design };
    }
    const design = event.frameDesign as { messages?: string[]; messageFrames?: Record<string, string | string[]> } | undefined;
    preparedMessage = prepareUploadMessage(
      messageMode,
      messageValue,
      design?.messages ?? [...DEFAULT_FRAME_MESSAGES],
      design?.messageFrames,
    );
  }

  const input = {
    kind,
    file: form.get('file'),
    name: form.get('name'),
    description: form.get('description') ?? undefined,
    category: form.get('category') ?? undefined,
    ...(preparedMessage ? { messageArea: DEFAULT_UPLOAD_MESSAGE_AREA } : {}),
    createdBy: session.user.id,
    owner: { scope: 'event' as const, eventId: String(event.eventId), partnerId: typeof event.partnerId === 'string' ? event.partnerId : null },
  };
  const result = await createLibraryItem(db, input);
  if (!result.ok) throw apiBadRequest(result.reason);
  if (!isAssignedKind(kind)) return apiCreated({ item: itemView(kind, result.item), assignment: null });

  const now = generateTimestamp();
  if (slot) {
    // The uploaded logo joins the slot; the old list is not touched.
    const added = await addLogoToEventSlot(db, event, slot, String(result.item.logoId), now);
    if (!added.ok) throw apiBadRequest(added.reason);
    return apiCreated({ item: itemView(kind, result.item), assignment: null, slot: added.value.slots[slot] ?? null });
  }
  // A logo's assignment carries its scenario and an order (0, as an assignment from the logo page gets).
  const assignment = {
    [KIND_META[kind].idField]: result.item[KIND_META[kind].idField],
    ...(kind === 'logos' ? { scenario, order: 0 } : {}),
    isActive: true,
    addedAt: now,
    addedBy: session.user.id,
  };
  await db.collection(COLLECTIONS.EVENTS).updateOne(
    { eventId: String(event.eventId) },
    { $push: { [kind]: assignment } as Document, $set: { updatedAt: now, ...(kind === 'frames' ? { framesOverridden: true } : { logosOverridden: true }) } }
  );
  let messageSetup: { message: string; status: 'ready' | 'needs-generation' | 'generation-failed' | 'link-failed'; detail?: string } | undefined;
  if (kind === 'frames' && preparedMessage) {
    try {
      const currentEvent = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
      if (!currentEvent) throw apiNotFound('Event');
      const design = await associateUploadedFrameMessage(db, currentEvent, String(result.item.frameId), preparedMessage);
      if (currentEvent.generatedFrameEnabled === true) {
        try {
          const generated = await generateFrameVariants(db, { ...currentEvent, frameDesign: design });
          messageSetup = { message: preparedMessage.message, status: 'ready', detail: `${generated.design.variants?.length ?? 0} event frame image(s) are ready.` };
        } catch (generationError) {
          console.error(`Event ${eventId}: frame message image generation failed after upload`, generationError);
          messageSetup = { message: preparedMessage.message, status: 'generation-failed', detail: 'The message was saved and linked. Use Generate default frame to retry drawing its images.' };
        }
      } else {
        messageSetup = { message: preparedMessage.message, status: 'needs-generation', detail: 'The message was saved and linked. Generate the default frame when you are ready to use it in the guest journey.' };
      }
    } catch (messageError) {
      const detail = messageError instanceof Error ? messageError.message : 'The frame could not be linked to the message.';
      messageSetup = { message: preparedMessage.message, status: 'link-failed', detail: `The frame was uploaded and assigned, but its message was not linked: ${detail}` };
    }
  }
  return apiCreated({ item: itemView(kind, result.item), assignment, ...(messageSetup ? { messageSetup } : {}) });
});
