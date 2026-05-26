/**
 * Style Sections Component
 *
 * Unified display component for Brand Colors, Assigned Frames, and Event Logos.
 * Used on both partner detail and event detail pages.
 */

import Link from 'next/link';
import Image from 'next/image';
import {
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from '@/components/gds/ui';
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
  icon: string;
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
  { id: 'slideshow-transition', name: 'Slideshow Transitions', icon: '🔄' },
  { id: 'onboarding-thankyou', name: 'Custom Pages', icon: '📝' },
  { id: 'loading-slideshow', name: 'Loading Slideshow', icon: '⏳' },
  { id: 'loading-capture', name: 'Loading Capture', icon: '📸' },
];

function ColorPreviewSwatch({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 16,
        backgroundColor: color,
        border: '1px solid var(--mantine-color-gray-3)',
        flexShrink: 0,
      }}
    />
  );
}

function ScenarioCountCard({
  icon,
  name,
  count,
}: {
  icon: string;
  name: string;
  count: number;
}) {
  return (
    <Card withBorder radius="md" bg="var(--mantine-color-gray-0)">
      <Stack gap="xs" align="center">
        <Text fz={32}>{icon}</Text>
        <Text size="xs" c="dimmed" ta="center">
          {name}
        </Text>
        <Text size="sm" fw={700}>
          {count} active
        </Text>
      </Stack>
    </Card>
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
    <Stack gap="lg">
      <Card p={0}>
        <Group justify="space-between" align="flex-start" p="xl" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <div>
            <Group gap="sm" align="center">
              <Title order={3}>{isPartner ? 'Default Brand Colors' : 'Brand Colors'}</Title>
              {isEvent && partnerName ? (
                <StyleInheritanceIndicator
                  styleField="brandColors"
                  isOverridden={brandColorsOverridden === true}
                  eventId={id}
                  partnerName={partnerName}
                />
              ) : null}
            </Group>
            <Text size="sm" c="dimmed" mt="xs">
              {isPartner
                ? 'Default colors for all child events (can be overridden)'
                : 'Used throughout the event experience: buttons, inputs, checkboxes, and camera interface'}
            </Text>
          </div>
          <Link href={isPartner ? `/admin/partners/${id}/edit` : `/admin/events/${id}/edit`} style={{ textDecoration: 'none' }}>
            <Button>Edit Colors</Button>
          </Link>
        </Group>

        <Stack p="xl" gap="lg">
          <Group align="flex-start" gap="xl" wrap="wrap">
            <Group align="center" gap="md" wrap="nowrap">
              <ColorPreviewSwatch color={brandColor || '#3B82F6'} />
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  Primary Color
                </Text>
                <Text ff="monospace" fw={700}>
                  {brandColor || '#3B82F6'}
                </Text>
                <Text size="xs" c="dimmed">
                  Buttons, camera button fill, focus states
                </Text>
              </Stack>
            </Group>

            <Group align="center" gap="md" wrap="nowrap">
              <ColorPreviewSwatch color={brandBorderColor || '#3B82F6'} />
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  Border/Accent Color
                </Text>
                <Text ff="monospace" fw={700}>
                  {brandBorderColor || '#3B82F6'}
                </Text>
                <Text size="xs" c="dimmed">
                  Input borders, checkboxes, camera button border
                </Text>
              </Stack>
            </Group>
          </Group>
        </Stack>

        <div style={{ padding: '0 1.5rem 1.5rem', borderTop: '1px solid var(--mantine-color-gray-2)' }}>
          <Text size="sm" fw={600} mb="sm" mt="lg">
            Color Preview
          </Text>
          <Group>
            <Button style={{ backgroundColor: brandColor || '#3B82F6' }} disabled>
              Primary Button
            </Button>
            <Button
              variant="outline"
              style={{ borderColor: brandBorderColor || '#3B82F6', color: brandBorderColor || '#3B82F6' }}
              disabled
            >
              Bordered Button
            </Button>
          </Group>
        </div>
      </Card>

      <Card p={0}>
        <Group justify="space-between" align="flex-start" p="xl" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <div>
            <Group gap="sm" align="center">
              <Title order={3}>{isPartner ? 'Default Frames' : 'Assigned Frames'}</Title>
              {isEvent && partnerName ? (
                <StyleInheritanceIndicator
                  styleField="frames"
                  isOverridden={framesOverridden === true}
                  eventId={id}
                  partnerName={partnerName}
                />
              ) : null}
            </Group>
          </div>
          <Link href={isPartner ? `/admin/partners/${id}/frames` : `/admin/events/${id}/frames`} style={{ textDecoration: 'none' }}>
            <Button>Manage Frames</Button>
          </Link>
        </Group>

        {frames.length === 0 ? (
          <Stack align="center" gap="sm" p="xl">
            <Text fz={48}>🖼️</Text>
            <Text fw={700} fz="lg">
              No frames assigned yet
            </Text>
            <Text c="dimmed" ta="center">
              {isPartner
                ? 'Set default frames that will be assigned to new events'
                : 'Assign frames to this event to make them available for users'}
            </Text>
            <Link href={isPartner ? `/admin/partners/${id}/frames` : `/admin/events/${id}/frames`} style={{ textDecoration: 'none' }}>
              <Button>Assign Frames</Button>
            </Link>
          </Stack>
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
                  <Card key={index} withBorder radius="md" bg="var(--mantine-color-gray-0)">
                    <Stack gap="sm" align="center">
                      {thumbnailUrl ? (
                        <Image src={thumbnailUrl} alt={frameName} width={128} height={128} unoptimized style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain' }} />
                      ) : (
                        <Text fz={32}>🖼️</Text>
                      )}
                      <Text size="sm" fw={600} ta="center" lineClamp={1}>
                        {frameName}
                      </Text>
                      <Text size="xs" ff="monospace" c="dimmed" ta="center" lineClamp={1}>
                        {frameAssignment.frameId}
                      </Text>
                      <Text
                        size="xs"
                        fw={700}
                        c={frameAssignment.isActive ? 'green.7' : 'gray.6'}
                      >
                        {frameAssignment.isActive ? '● Active' : '○ Inactive'}
                      </Text>
                    </Stack>
                  </Card>
                );
              })}
            </div>
            <Group justify="center" mt="md">
              <Link href={isPartner ? `/admin/partners/${id}/edit#frames` : `/admin/events/${id}/frames`} style={{ textDecoration: 'none' }}>
                <Button variant="subtle">Manage frame assignments →</Button>
              </Link>
            </Group>
          </div>
        )}
      </Card>

      <Card p={0}>
        <Group justify="space-between" align="flex-start" p="xl" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <div>
            <Group gap="sm" align="center">
              <Title order={3}>{isPartner ? 'Default Logos' : 'Event Logos'}</Title>
              {isEvent && partnerName ? (
                <StyleInheritanceIndicator
                  styleField="logos"
                  isOverridden={logosOverridden === true}
                  eventId={id}
                  partnerName={partnerName}
                />
              ) : null}
            </Group>
          </div>
          <Link href={isPartner ? `/admin/partners/${id}/logos` : `/admin/events/${id}/logos`} style={{ textDecoration: 'none' }}>
            <Button>Manage Logos</Button>
          </Link>
        </Group>

        {logos.length === 0 ? (
          <Stack align="center" gap="sm" p="xl">
            <Text fz={48}>🎨</Text>
            <Text fw={700} fz="lg">
              No logos assigned yet
            </Text>
            <Text c="dimmed" ta="center">
              {isPartner
                ? 'Set default logos that will be assigned to new events'
                : 'Assign logos to display on different screens (transitions, loading, custom pages)'}
            </Text>
            <Link href={isPartner ? `/admin/partners/${id}/logos` : `/admin/events/${id}/logos`} style={{ textDecoration: 'none' }}>
              <Button>Assign Logos</Button>
            </Link>
          </Stack>
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
                return <ScenarioCountCard key={scenario.id} icon={scenario.icon} name={scenario.name} count={count} />;
              })}
            </div>
            <Group justify="center" mt="md">
              <Link href={isPartner ? `/admin/partners/${id}/edit#logos` : `/admin/events/${id}/logos`} style={{ textDecoration: 'none' }}>
                <Button variant="subtle">Manage logo assignments →</Button>
              </Link>
            </Group>
          </div>
        )}
      </Card>
    </Stack>
  );
}
