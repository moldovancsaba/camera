'use client';

/**
 * The slots of the event's generated frame (docs/FRAME_SLOTS_PLAN.md, issue 502): the generic editor (FrameSlotsEditor) wired to the event. It starts from what the event has: its own slots,
 * else what it follows (its partner's default, the general default, or the default frame's four slots). Talks to GET /api/admin/events/[id]/frame-design, PUT .../frame-slots and
 * POST .../frame-slots/preview. Saving also draws the images, which takes a few seconds.
 */

import { useMemo } from 'react';
import FrameSlotsEditor, { call, type SlotsAdapter, type SlotsPreview, type SlotsState } from '@/components/admin/FrameSlotsEditor';
import type { FrameDesign } from '@/lib/frame/context';
import type { FrameSlots } from '@/lib/frame/slots';
import type { InheritedSlots } from '@/lib/frame/slots-inherit';

interface Loaded {
  frameDesign: FrameDesign | null;
  defaultMessages: string[];
  inheritedSlots?: InheritedSlots;
}

const FOLLOWS: Record<InheritedSlots['source'], string> = {
  partner: "This event follows its partner's default slots",
  global: 'This event follows the general default slots',
  'built-in': 'This event uses the default frame (four slots)',
};

const stateOf = (loaded: Loaded, design: FrameDesign | null): SlotsState => {
  const own: FrameSlots | undefined = design?.slots;
  const inherited = loaded.inheritedSlots ?? { slots: undefined, source: 'built-in' as const };
  return {
    own,
    startFrom: inherited.slots,
    messages: design?.messages ?? loaded.defaultMessages,
    description: own ? 'This event has its own slots.' : `${FOLLOWS[inherited.source]}; change a slot to make slots of its own.`,
    canReset: Boolean(own),
  };
};

export default function FrameSlotsPanel({ eventId, onDesignChanged }: { eventId: string; onDesignChanged?: () => void }) {
  const adapter = useMemo<SlotsAdapter>(() => {
    const endpoint = `/api/admin/events/${eventId}/frame-design`;
    const slotsEndpoint = `/api/admin/events/${eventId}/frame-slots`;
    const read = async () => {
      const loaded = await call<Loaded>(endpoint, undefined, 'Could not load the frame');
      return stateOf(loaded, loaded.frameDesign);
    };
    return {
      pictureLevel: { scope: 'event', eventId },
      load: read,
      preview: (slots, messageIndex, signal) =>
        call<SlotsPreview>(`${slotsEndpoint}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slots, messageIndex }), signal }, 'The preview could not be drawn'),
      save: async (slots) => {
        const result = await call<{ variants: { total: number; generated: number; reused: number } }>(
          slotsEndpoint,
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slots === null ? { reset: true } : { slots }) },
          slots === null ? 'Could not go back to the default' : 'Could not save the slots'
        );
        onDesignChanged?.();
        return {
          // Read again: what the event follows is part of the state, and is not in the answer of the save.
          state: await read(),
          lines: [`${result.variants.total} ${result.variants.total === 1 ? 'image' : 'images'}: ${result.variants.generated} drawn, ${result.variants.reused} reused.`],
        };
      },
      texts: { title: 'Frame slots', saveButton: 'Save the slots and draw the images', savingButton: 'Saving and drawing the images…', resetButton: 'Use the default again', resettingButton: 'Going back…' },
    };
  }, [eventId, onDesignChanged]);
  return <FrameSlotsEditor adapter={adapter} />;
}
