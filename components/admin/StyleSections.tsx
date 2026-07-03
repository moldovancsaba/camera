/**
 * Style Sections Component
 *
 * Unified display component for Brand Colors, Assigned Frames, and Event Logos.
 * Used on both partner detail and event detail pages.
 */

'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import Link from 'next/link';
import Image from 'next/image';
import { StateBlock } from '@sovereignsquad/gds-core/client';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';
import StyleInheritanceIndicator from './StyleInheritanceIndicator';

interface FrameAssignment {
  frameId: string;
  isActive: boolean;
  frameDetails?: {
    thumbnailUrl?: string;
    name?: string;
  } | null;
  thumbnailUrl?: string;
  name?: string;
}

interface LogoAssignment {
  logoId: string;
  scenario?: string;
  isActive: boolean;
}

interface ScenarioSummary {
  id: string;
  name: string;
}

interface StyleSectionsProps {
  type: 'partner' | 'event';
  id: string;
  brandColor?: string;
  brandBorderColor?: string;
  brandColorsOverridden?: boolean;
  frames?: FrameAssignment[];
  framesOverridden?: boolean;
  logos?: LogoAssignment[];
  logosOverridden?: boolean;
  partnerName?: string;
}

const SCENARIOS: ScenarioSummary[] = [
  { id: 'slideshow-transition', name: 'Slideshow Transitions' },
  { id: 'onboarding-thankyou', name: 'Custom Pages' },
  { id: 'loading-slideshow', name: 'Loading Slideshow' },
  { id: 'loading-capture', name: 'Loading Capture' },
];

function ColorPreviewSwatch({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 16,
        backgroundColor: color,
        border: '1px solid var(--gds-color-border)',
        flexShrink: 0,
      }}
    />
  );
}

function ScenarioCountCard({
  name,
  count,
}: {
  name: string;
  count: number;
}) {
  return (
    <article style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}>
      <div style={{ alignItems: 'center', display: 'grid', gap: '0.5rem', justifyItems: 'center' }}>
        <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', textAlign: 'center' }}>
          {name}
        </span>
        <strong style={{ fontSize: '0.875rem' }}>
          {count} active
        </strong>
      </div>
    </article>
  );
}

export default function StyleSections({
  type,
  id,
  brandColor,
  brandBorderColor,
  brandColorsOverridden,
  frames = [],
  framesOverridden,
  logos = [],
  logosOverridden,
  partnerName,
}: StyleSectionsProps) {
  const isPartner = type === 'partner';
  const isEvent = type === 'event';

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
        <div style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--gds-color-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', padding: '1.5rem' }}>
          <div>
            <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>{isPartner ? 'Default Brand Colors' : 'Brand Colors'}</h3>
              {isEvent && partnerName ? (
                <StyleInheritanceIndicator
                  styleField="brandColors"
                  isOverridden={brandColorsOverridden === true}
                  eventId={id}
                  partnerName={partnerName}
                />
              ) : null}
            </div>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
              {isPartner
                ? 'Default colors for all child events (can be overridden)'
                : 'Used throughout the event experience: buttons, inputs, checkboxes, and camera interface'}
            </p>
          </div>
          <Link href={isPartner ? `/admin/partners/${id}/edit` : `/admin/events/${id}/edit`} style={{ textDecoration: 'none' }}>
            <SemanticButton action="style-sections:edit-colors">Edit Colors</SemanticButton>
          </Link>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem', padding: '1.5rem' }}>
          <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
            <div style={{ alignItems: 'center', display: 'flex', gap: '1rem' }}>
              <ColorPreviewSwatch color={brandColor || CAMERA_DEFAULT_BRAND_COLOR} />
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <strong style={{ fontSize: '0.875rem' }}>
                  Primary Color
                </strong>
                <code style={{ fontWeight: 700 }}>
                  {brandColor || CAMERA_DEFAULT_BRAND_COLOR}
                </code>
                <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
                  Buttons, camera button fill, focus states
                </span>
              </div>
            </div>

            <div style={{ alignItems: 'center', display: 'flex', gap: '1rem' }}>
              <ColorPreviewSwatch color={brandBorderColor || CAMERA_DEFAULT_BRAND_BORDER_COLOR} />
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <strong style={{ fontSize: '0.875rem' }}>
                  Border/Accent Color
                </strong>
                <code style={{ fontWeight: 700 }}>
                  {brandBorderColor || CAMERA_DEFAULT_BRAND_BORDER_COLOR}
                </code>
                <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
                  Input borders, checkboxes, camera button border
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--gds-color-border)' }}>
          <strong style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            Color Preview
          </strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button type="button" style={{ backgroundColor: brandColor || CAMERA_DEFAULT_BRAND_COLOR, border: 0, borderRadius: '0.75rem', padding: '0.75rem 1rem' }} disabled>
              Primary Button
            </button>
            <button
              type="button"
              style={{
                borderColor: brandBorderColor || CAMERA_DEFAULT_BRAND_BORDER_COLOR,
                color: brandBorderColor || CAMERA_DEFAULT_BRAND_BORDER_COLOR,
                borderRadius: '0.75rem',
                padding: '0.75rem 1rem',
              }}
              disabled
            >
              Bordered Button
            </button>
          </div>
        </div>
      </section>

      <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
        <div style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--gds-color-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', padding: '1.5rem' }}>
          <div>
            <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>{isPartner ? 'Default Frames' : 'Assigned Frames'}</h3>
              {isEvent && partnerName ? (
                <StyleInheritanceIndicator
                  styleField="frames"
                  isOverridden={framesOverridden === true}
                  eventId={id}
                  partnerName={partnerName}
                />
              ) : null}
            </div>
          </div>
          <Link href={isPartner ? `/admin/partners/${id}/frames` : `/admin/events/${id}/frames`} style={{ textDecoration: 'none' }}>
            <SemanticButton action="style-sections:manage-frames">Manage Frames</SemanticButton>
          </Link>
        </div>

        {frames.length === 0 ? (
          <div style={{ padding: '1.5rem' }}>
            <StateBlock
              variant="empty"
              title="No frames assigned yet"
              description={isPartner
                ? 'Set default frames that will be assigned to new events.'
                : 'Assign frames to this event to make them available for users.'}
              action={
                <Link href={isPartner ? `/admin/partners/${id}/frames` : `/admin/events/${id}/frames`} style={{ textDecoration: 'none' }}>
                  <SemanticButton action="style-sections:assign-frames">Assign Frames</SemanticButton>
                </Link>
              }
            />
          </div>
        ) : (
          <div style={{ padding: '1.5rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
              }}
            >
              {frames.map((frameAssignment, index) => {
                const frameDetails = frameAssignment.frameDetails || frameAssignment;
                const thumbnailUrl = frameDetails.thumbnailUrl;
                const frameName = frameDetails.name || 'Unnamed Frame';

                return (
                  <article key={index} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}>
                    <div style={{ alignItems: 'center', display: 'grid', gap: '0.5rem', justifyItems: 'center' }}>
                      {thumbnailUrl ? (
                        <Image src={thumbnailUrl} alt={frameName} width={128} height={128} unoptimized style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain' }} />
                      ) : (
                        <span aria-hidden>Image</span>
                      )}
                      <strong style={{ fontSize: '0.875rem', overflow: 'hidden', textAlign: 'center', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                        {frameName}
                      </strong>
                      <code style={{ color: 'var(--gds-color-muted)', display: 'block', fontSize: '0.75rem', overflow: 'hidden', textAlign: 'center', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                        {frameAssignment.frameId}
                      </code>
                      <strong style={{ fontSize: '0.75rem' }}>
                        {frameAssignment.isActive ? 'Active' : 'Inactive'}
                      </strong>
                    </div>
                  </article>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
              <Link href={isPartner ? `/admin/partners/${id}/edit#frames` : `/admin/events/${id}/frames`} style={{ textDecoration: 'none' }}>
                <SemanticButton action="style-sections:manage-frame-assignments" variant="secondary">Manage frame assignments →</SemanticButton>
              </Link>
            </div>
          </div>
        )}
      </section>

      <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
        <div style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--gds-color-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', padding: '1.5rem' }}>
          <div>
            <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>{isPartner ? 'Default Logos' : 'Event Logos'}</h3>
              {isEvent && partnerName ? (
                <StyleInheritanceIndicator
                  styleField="logos"
                  isOverridden={logosOverridden === true}
                  eventId={id}
                  partnerName={partnerName}
                />
              ) : null}
            </div>
          </div>
          <Link href={isPartner ? `/admin/partners/${id}/logos` : `/admin/events/${id}/logos`} style={{ textDecoration: 'none' }}>
            <SemanticButton action="style-sections:manage-logos">Manage Logos</SemanticButton>
          </Link>
        </div>

        {logos.length === 0 ? (
          <div style={{ padding: '1.5rem' }}>
            <StateBlock
              variant="empty"
              title="No logos assigned yet"
              description={isPartner
                ? 'Set default logos that will be assigned to new events.'
                : 'Assign logos to display on different screens.'}
              action={
                <Link href={isPartner ? `/admin/partners/${id}/logos` : `/admin/events/${id}/logos`} style={{ textDecoration: 'none' }}>
                  <SemanticButton action="style-sections:assign-logos">Assign Logos</SemanticButton>
                </Link>
              }
            />
          </div>
        ) : (
          <div style={{ padding: '1.5rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '1rem',
              }}
            >
              {SCENARIOS.map((scenario) => {
                const count = logos.filter((logo) => logo.scenario === scenario.id && logo.isActive).length;
                return <ScenarioCountCard key={scenario.id} name={scenario.name} count={count} />;
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
              <Link href={isPartner ? `/admin/partners/${id}/edit#logos` : `/admin/events/${id}/logos`} style={{ textDecoration: 'none' }}>
                <SemanticButton action="style-sections:manage-logo-assignments" variant="secondary">Manage logo assignments →</SemanticButton>
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
