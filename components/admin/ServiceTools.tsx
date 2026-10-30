'use client';

import { GdsStack, SectionPanel } from '@sovereignsquad/gds-core/client';
import FrameBackfillConsole from '@/components/admin/FrameBackfillConsole';
import PhotoVettingRolloutConsole from '@/components/admin/PhotoVettingRolloutConsole';
import WelcomeScreenBackfillCard from '@/components/admin/WelcomeScreenBackfillCard';
import ScreenPicturesCard from '@/components/admin/ScreenPicturesCard';
import MediaHealthCard from '@/components/admin/MediaHealthCard';
import ImageSafetyCard from '@/components/admin/ImageSafetyCard';

/** Client-side composition for the GDS controls on the global maintenance page. */
export default function ServiceTools() {
  return (
    <GdsStack gap="lg">
      <SectionPanel title="Backfills and rollouts" description="Use these tools only when an existing record set needs a deliberate, reviewable update.">
        <GdsStack gap="lg">
          <section id="generated-frame-rollout" aria-labelledby="generated-frame-rollout-title" style={{ scrollMarginTop: '1.5rem' }}>
            <h3 id="generated-frame-rollout-title">Generated default frame rollout</h3>
            <p>Review the dry-run report before applying or redrawing generated frames for existing events.</p>
            <FrameBackfillConsole />
          </section>
          <section id="photo-vetting-rollout" aria-labelledby="photo-vetting-rollout-title" style={{ scrollMarginTop: '1.5rem' }}>
            <h3 id="photo-vetting-rollout-title">Photo vetting rollout</h3>
            <p>Review the affected events before enabling vetting across events that do not already have it.</p>
            <PhotoVettingRolloutConsole />
          </section>
          <section id="welcome-screen-backfill" aria-labelledby="welcome-screen-backfill-title" style={{ scrollMarginTop: '1.5rem' }}>
            <h3 id="welcome-screen-backfill-title">Welcome screen backfill</h3>
            <p>Choose the existing events to update after reviewing the dry run.</p>
            <WelcomeScreenBackfillCard />
          </section>
          <section id="screen-picture-backfill" aria-labelledby="screen-picture-backfill-title" style={{ scrollMarginTop: '1.5rem' }}>
            <h3 id="screen-picture-backfill-title">Screen-sized picture backfill</h3>
            <p>Create missing display-sized copies for photos already stored on slideshow events.</p>
            <ScreenPicturesCard />
          </section>
        </GdsStack>
      </SectionPanel>

      <SectionPanel title="Media health and storage" description="Check stored media and repair missing copies without deleting source files.">
        <GdsStack gap="lg">
          <MediaHealthCard />
          <ImageSafetyCard />
        </GdsStack>
      </SectionPanel>
    </GdsStack>
  );
}
