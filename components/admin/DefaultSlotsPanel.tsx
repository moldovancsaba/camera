'use client';

/**
 * The default slots of a partner or of the general level (docs/FRAME_SLOTS_PLAN.md segment 5, owner answer 220): the generic editor (FrameSlotsEditor) wired to the default of a level.
 * Events follow a default until they have slots of their own; nothing is copied onto them. After a change the images of the events that follow are drawn again, one event after another
 * (a frame takes a few seconds), with the progress shown. Talks to GET/PUT/POST /api/partners/<id>/frame-slots or /api/admin/frame-slots.
 */

import { useMemo } from 'react';
import FrameSlotsEditor, { call, type SlotsAdapter, type SlotsPreview, type SlotsState } from '@/components/admin/FrameSlotsEditor';
import type { FrameSlots } from '@/lib/frame/slots';

interface Follower {
  id: string;
  eventId: string;
  name: string;
}

interface View {
  slots: FrameSlots | null;
  inherited: FrameSlots | null;
  messages: string[];
  sampleEvent: { id: string; name: string } | null;
  followers: number;
}

const json = (init: RequestInit, body: unknown): RequestInit => ({ ...init, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function DefaultSlotsPanel({ level }: { level: { scope: 'global' } | { scope: 'partner'; partnerMongoId: string } }) {
  const partnerMongoId = level.scope === 'partner' ? level.partnerMongoId : null;
  const adapter = useMemo<SlotsAdapter>(() => {
    const url = partnerMongoId ? `/api/partners/${partnerMongoId}/frame-slots` : '/api/admin/frame-slots';
    const who = partnerMongoId ? "this partner's events" : 'every event';
    const stateOf = (view: View): SlotsState => ({
      own: view.slots ?? undefined,
      startFrom: view.inherited ?? undefined,
      messages: view.messages,
      description: view.slots
        ? `These are the default slots of ${partnerMongoId ? 'this partner' : 'the general level'}: ${who} follow them until an event sets slots of its own. ${view.followers} ${view.followers === 1 ? 'event follows' : 'events follow'} them now.`
        : `${partnerMongoId ? (view.inherited ? 'This partner follows the general default slots.' : 'This partner has no default slots: its events use the default frame (four slots).') : 'There are no general default slots: events use the default frame (four slots).'} Change a slot to set default slots${partnerMongoId ? ' for this partner' : ''}${view.sampleEvent ? `; the preview uses the event "${view.sampleEvent.name}"` : '; there is no event yet to preview with, so the preview uses a made-up one'}.`,
      canReset: Boolean(view.slots),
    });
    return {
      pictureLevel: partnerMongoId ? { scope: 'partner', partnerId: partnerMongoId } : { scope: 'global' },
      load: async () => stateOf(await call<View>(url, undefined, 'Could not load the default slots')),
      preview: (slots, messageIndex, signal) => call<SlotsPreview>(url, json({ method: 'POST', signal }, { action: 'preview', slots, messageIndex }), 'The preview could not be drawn'),
      save: async (slots, progress) => {
        const saved = await call<{ slots: FrameSlots | null; followers: Follower[] }>(url, json({ method: 'PUT' }, slots === null ? { reset: true } : { slots }), slots === null ? 'Could not take the default away' : 'Could not save the default slots');
        // The events that follow now draw their images again, one after another.
        let generated = 0;
        let failed = 0;
        for (const [index, follower] of saved.followers.entries()) {
          progress(`Drawing the images of ${follower.name || 'an event'} (${index + 1} of ${saved.followers.length})…`);
          try {
            generated += (await call<{ generated: number }>(url, json({ method: 'POST' }, { action: 'redraw', eventId: follower.id }), 'An event could not be redrawn')).generated;
          } catch {
            failed += 1;
          }
        }
        const view = await call<View>(url, undefined, 'Could not load the default slots');
        return {
          state: stateOf(view),
          lines: [
            saved.followers.length === 0
              ? 'No event has images that follow this default yet; they read it when their images are first drawn.'
              : `${saved.followers.length} ${saved.followers.length === 1 ? 'event' : 'events'} followed: ${generated} images drawn again${failed > 0 ? `, ${failed} ${failed === 1 ? 'event' : 'events'} could not be redrawn (open its Frames page and save the messages to draw it)` : ''}.`,
          ],
        };
      },
      texts: {
        title: partnerMongoId ? 'Default frame slots' : 'General default frame slots',
        saveButton: 'Save the default and redraw the events that follow',
        savingButton: 'Saving…',
        resetButton: 'Take the default away',
        resettingButton: 'Taking it away…',
      },
    };
  }, [partnerMongoId]);
  return <FrameSlotsEditor adapter={adapter} />;
}
