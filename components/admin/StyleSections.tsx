/**
 * Style Sections Component
 *
 * Unified display component for Brand Colors, Assigned Frames, and Event Logos,
 * with the way to the Images library. Used on both partner detail and event detail pages.
 */

'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import Link from 'next/link';
import FrameThumbnail from '@/components/admin/FrameThumbnail';
import { StateBlock } from '@sovereignsquad/gds-core/client';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';
import StyleInheritanceIndicator from './StyleInheritanceIndicator';
import type { ButtonColourSource } from '@/lib/theme/event-theme';

interface FrameAssignment {
  frameId: string;
  isActive: boolean;
  frameDetails?: {
    thumbnailUrl?: string;
    imageUrl?: string;
    name?: string;
  } | null;
  thumbnailUrl?: string;
  imageUrl?: string;
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

/** The colours the guests get on the buttons of an event, and where they come from (camera#380); the event page resolves them with the guest pages' own function. */
export interface ThemeColours {
  fill: string;
  label: string;
  ring: string;
  source: ButtonColourSource;
  /** The name of the messmass style of the event, when it has one. */
  styleName: string | null;
}

/** What the source line under the colours says. */
function colourSourceText(source: ButtonColourSource, styleName: string | null, hasOwn: boolean, overridden: boolean, partnerName?: string): string {
  switch (source) {
    case 'welcome':
      return 'The colours of the Start button on the welcome page: they come first and give every button of the flow its look.';
    case 'event':
      return overridden || !hasOwn ? 'This event\'s own colours.' : `The default colours of ${partnerName ?? 'the partner'}.`;
    case 'messmass':
      return styleName ? `From messmass: the style "${styleName}" of the event's report.` : 'From messmass: the style of the event\'s report.';
    default:
      return 'The system default look: this event has no messmass style yet.';
  }
}

interface StyleSectionsProps {
  type: 'partner' | 'event';
  id: string;
  brandColor?: string | null;
  brandBorderColor?: string | null;
  brandColorsOverridden?: boolean;
  /** Event only: the colours the guests really get and their source. */
  themeColours?: ThemeColours;
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
  themeColours,
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
                  hasOwnValue={Boolean(brandColor || brandBorderColor)}
                  followsMessmass={!brandColor && !brandBorderColor}
                  eventId={id}
                  partnerName={partnerName}
                />
              ) : null}
            </div>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
              {isPartner
                ? 'The colours the events of this partner start with. When none are set, every event follows the colours of its messmass style; an event can still set its own.'
                : 'The colours of the buttons, inputs, checkboxes and the camera screens, as the users see them. By default they come from messmass; Edit Colors sets your own.'}
            </p>
          </div>
          <Link href={isPartner ? `/admin/partners/${id}/edit` : `/admin/events/${id}/edit`} style={{ textDecoration: 'none' }}>
            <SemanticButton action="style-sections:edit-colors">Edit Colors</SemanticButton>
          </Link>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem', padding: '1.5rem' }}>
          {isPartner && !brandColor && !brandBorderColor ? (
            <StateBlock variant="empty" title="No default colours" description="The events of this partner follow the colours of their messmass style. Set default colours only when every event of the partner should share them." />
          ) : (
            <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
              <div style={{ alignItems: 'center', display: 'flex', gap: '1rem' }}>
                <ColorPreviewSwatch color={themeColours?.fill ?? brandColor ?? CAMERA_DEFAULT_BRAND_COLOR} />
                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  <strong style={{ fontSize: '0.875rem' }}>Primary Color</strong>
                  <code style={{ fontWeight: 700 }}>{themeColours?.fill ?? brandColor ?? CAMERA_DEFAULT_BRAND_COLOR}</code>
                  <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>Buttons, camera button fill, focus states</span>
                </div>
              </div>

              <div style={{ alignItems: 'center', display: 'flex', gap: '1rem' }}>
                <ColorPreviewSwatch color={themeColours?.ring ?? brandBorderColor ?? CAMERA_DEFAULT_BRAND_BORDER_COLOR} />
                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  <strong style={{ fontSize: '0.875rem' }}>Border/Accent Color</strong>
                  <code style={{ fontWeight: 700 }}>{themeColours?.ring ?? brandBorderColor ?? CAMERA_DEFAULT_BRAND_BORDER_COLOR}</code>
                  <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>Input borders, checkboxes, camera button border</span>
                </div>
              </div>
            </div>
          )}
          {isEvent && themeColours ? (
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.8125rem', margin: 0 }}>
              {colourSourceText(themeColours.source, themeColours.styleName, Boolean(brandColor || brandBorderColor), brandColorsOverridden === true, partnerName)}
              {themeColours.source === 'welcome' && (brandColor || brandBorderColor) ? ' The colours set here are kept, but they do not show while the welcome page sets its own.' : ''}
            </p>
          ) : null}
        </div>

        {isEvent && themeColours ? (
          <div style={{ padding: '1.5rem', borderTop: '1px solid var(--gds-color-border)' }}>
            <strong style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.75rem' }}>Color Preview</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button type="button" style={{ backgroundColor: themeColours.fill, border: `2px solid ${themeColours.ring}`, borderRadius: '999px', color: themeColours.label, fontWeight: 700, padding: '0.75rem 1.25rem' }} disabled>
                Primary Button
              </button>
              <button type="button" style={{ backgroundColor: themeColours.label, border: `2px solid ${themeColours.ring}`, borderRadius: '999px', color: themeColours.fill, fontWeight: 700, padding: '0.75rem 1.25rem' }} disabled>
                Bordered Button
              </button>
            </div>
          </div>
        ) : null}
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
                ? 'Add frames to the partner library and mark the defaults that are assigned to its new events.'
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
                const frameName = frameDetails.name || 'Unnamed Frame';

                return (
                  <article key={index} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}>
                    <div style={{ alignItems: 'center', display: 'grid', gap: '0.5rem', justifyItems: 'center' }}>
                      <FrameThumbnail frame={{ name: frameName, thumbnailUrl: frameDetails.thumbnailUrl, imageUrl: frameDetails.imageUrl }} width="100%" />
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
              <Link href={isPartner ? `/admin/partners/${id}/frames` : `/admin/events/${id}/frames`} style={{ textDecoration: 'none' }}>
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

      {/* The Images library (camera#368): the pictures the picture fields choose from. */}
      <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
        <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', padding: '1.5rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>{isPartner ? 'Partner Images' : 'Event Images'}</h3>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
              {isPartner
                ? 'The pictures the events of this partner can use: on the welcome page, the CTA page, in the email footer and on the giant screen.'
                : 'The pictures this event can use: on the welcome page, the CTA page, in the email footer and on the giant screen.'}
            </p>
          </div>
          <Link href={isPartner ? `/admin/partners/${id}/images` : `/admin/events/${id}/images`} style={{ textDecoration: 'none' }}>
            <SemanticButton action="style-sections:manage-images">Manage Images</SemanticButton>
          </Link>
        </div>
      </section>
    </div>
  );
}
