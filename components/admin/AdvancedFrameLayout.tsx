'use client';

import { Accordion } from '@sovereignsquad/gds-core/client';
import DefaultSlotsPanel from '@/components/admin/DefaultSlotsPanel';
import FrameSlotsPanel from '@/components/admin/FrameSlotsPanel';

type Level = { scope: 'global' } | { scope: 'partner'; partnerMongoId: string } | { scope: 'event'; eventId: string; onDesignChanged?: () => void };

/** Advanced composition settings live inside the frame workflow so users do not mistake them for a second frame library. */
export default function AdvancedFrameLayout({ level }: { level: Level }) {
  return (
    <section id="generated-frame-layout" style={{ scrollMarginTop: '1rem' }}>
      <Accordion variant="separated">
        <Accordion.Item value="generated-frame-layout">
          <Accordion.Control>Advanced generated-frame layout</Accordion.Control>
          <Accordion.Panel>
            <p style={{ color: 'var(--mantine-color-dimmed)', marginTop: 0 }}>
              Optional layout settings for composing generated frames. This does not add a frame to the chooser. On event pages, generate the default frame separately when you need it.
            </p>
            {level.scope === 'event'
              ? <FrameSlotsPanel eventId={level.eventId} onDesignChanged={level.onDesignChanged} />
              : <DefaultSlotsPanel level={level} />}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </section>
  );
}
