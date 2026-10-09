'use client';

/**
 * The one screen the capture flow shows while it works and the user can do nothing (making the picture, saving the photo): a card in the colours of the event
 * in the middle of the screen, over a veil in the page colour of the event, with a spinner and what is happening. It used to be a line of text with no background
 * that was drawn straight over the photo, and its words ran into the picture (owner, 2026-10-09, from the MTK x Vasas event). Everything that is not the card is
 * covered, so nothing can show through or overlap it; a message that stays on the screen is a card too, a short one is a notice (components/capture/notify.ts).
 */

import Image from 'next/image';
import { Loader } from '@mantine/core';

export default function ProcessingOverlay({ message, logoUrl, logoAlt }: { message: string; logoUrl?: string | null; logoAlt?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-processing-overlay
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--event-bg) 80%, transparent)', backdropFilter: 'blur(2px)' }}
    >
      <div data-event-card className="flex w-full max-w-xs flex-col items-center gap-3 p-6 text-center shadow-lg">
        {logoUrl ? <Image src={logoUrl} alt={logoAlt ?? ''} width={96} height={96} unoptimized className="object-contain" /> : null}
        <Loader size="md" color="var(--event-button-bg)" />
        <p className="font-medium">{message}</p>
      </div>
    </div>
  );
}
