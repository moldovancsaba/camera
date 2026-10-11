'use client';

/**
 * The sample selfies of a partner or an event (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): the same slot panel as the logo, at the level of the page it is on. It is the generic tagged picture
 * panel (`TaggedSlotPanel`) for the sample selfie; the name is the one the pages always imported.
 */

import TaggedSlotPanel from '@/components/admin/TaggedSlotPanel';

export default function SampleSelfiePanel({ level, id, onChanged }: { level: 'partner' | 'event'; id: string; onChanged?: () => void | Promise<void> }) {
  return <TaggedSlotPanel kind="selfie" level={level} id={id} onChanged={onChanged} />;
}
