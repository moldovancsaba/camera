'use client';

/**
 * One item of a library on a page (camera#361): its picture, name, where it comes from, optional badges and notes, and the buttons that
 * belong to this list (add, remove, assign, switch...). The same card on the partner page and the event page, for frames and later logos and images.
 */

import type { ReactNode } from 'react';
import { LabelTag } from '@sovereignsquad/gds-core/client';
import AssetThumbnail from '@/components/admin/library/AssetThumbnail';

export type LibraryScopeName = 'global' | 'partner' | 'event';

const SCOPE_LABEL: Record<LibraryScopeName, { label: string; tone: 'neutral' | 'info' | 'success' }> = {
  global: { label: 'Global library', tone: 'neutral' },
  partner: { label: 'Partner upload', tone: 'info' },
  event: { label: 'Event upload', tone: 'success' },
};

export interface LibraryItemCardProps {
  name: string;
  imageUrl: string | null;
  thumbnailUrl?: string | null;
  /** What the item is: "frame", "logo", "image". */
  noun: string;
  scope: LibraryScopeName;
  /** Where an item that was not uploaded came from: `messmass` for the partner's logo imported from messmass (camera#367). */
  source?: string | null;
  /** More tags next to the origin (default for new events, not in the partner library any more...). */
  badges?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  /** More content under the buttons (an editor), and `wide` to let the card take the whole row of the grid while it is open. */
  children?: ReactNode;
  wide?: boolean;
}

const FROM_MESSMASS = { label: 'From messmass', tone: 'info' } as const;

export default function LibraryItemCard({ name, imageUrl, thumbnailUrl, noun, scope, source, badges, note, actions, children, wide }: LibraryItemCardProps) {
  const origin = source === 'messmass' ? FROM_MESSMASS : SCOPE_LABEL[scope];
  return (
    <article style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', padding: '0.75rem', display: 'grid', gap: '0.75rem', alignContent: 'start', ...(wide ? { gridColumn: '1 / -1' } : {}) }}>
      <AssetThumbnail url={imageUrl ?? thumbnailUrl ?? null} name={name} noun={noun} width="100%" />
      <div style={{ display: 'grid', gap: '0.35rem', minWidth: 0 }}>
        <strong style={{ fontSize: '0.875rem', overflowWrap: 'anywhere' }}>{name}</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          <LabelTag tone={origin.tone} label={origin.label} />
          {badges}
        </div>
        {note ? <div style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>{note}</div> : null}
      </div>
      {actions ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>{actions}</div> : null}
      {children}
    </article>
  );
}
