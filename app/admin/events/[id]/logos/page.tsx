'use client';

/**
 * Event Logos Management Page
 *
 * Manage logo assignments for event scenarios.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';

interface Logo {
  logoId: string;
  name: string;
  imageUrl: string;
  thumbnailUrl: string;
  isActive: boolean;
}

interface LogoAssignment {
  logoId: string;
  scenario: string;
  order: number;
  isActive: boolean;
  addedAt: string;
  name: string;
  imageUrl: string;
  thumbnailUrl: string;
}

interface EventLogosRecord {
  _id: string;
  name: string;
}

interface EventLogosResponse {
  eventId?: string;
  eventName?: string;
  logos?: Record<string, LogoAssignment[]>;
  data?: { logos?: Record<string, LogoAssignment[]> };
  error?: string;
}

interface LogosResponse {
  logos?: Logo[];
  data?: { logos?: Logo[] };
  error?: string;
}

const SCENARIOS = [
  { id: 'slideshow-transition', name: 'Slideshow Transition', description: 'Logo shown during slide transitions with fade in/out' },
  { id: 'onboarding-thankyou', name: 'Onboarding/Thank You Pages', description: 'Logo displayed at top center on custom pages' },
  { id: 'loading-slideshow', name: 'Loading Slideshow', description: 'Logo shown while slideshow is loading' },
  { id: 'loading-capture', name: 'Loading Capture App', description: 'Logo shown while capture app is loading' },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function EventLogosPage({ params }: { params: Promise<{ id: string }> }) {
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState<EventLogosRecord | null>(null);
  const [availableLogos, setAvailableLogos] = useState<Logo[]>([]);
  const [assignedLogos, setAssignedLogos] = useState<Record<string, LogoAssignment[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolved) => setEventId(resolved.id));
  }, [params]);

  const refreshAssignments = async (currentEventId: string) => {
    const eventResponse = await fetch(`/api/events/${currentEventId}/logos`);
    const eventData: EventLogosResponse = await eventResponse.json();
    const assignedLogosData = eventData.logos || eventData.data?.logos || {};
    setAssignedLogos(assignedLogosData);
  };

  useEffect(() => {
    if (!eventId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);

        const eventResponse = await fetch(`/api/events/${eventId}/logos`);
        const eventData: EventLogosResponse = await eventResponse.json();
        if (!eventResponse.ok) {
          throw new Error(eventData.error || 'Failed to load event');
        }
        if (!eventData.eventId || !eventData.eventName) {
          throw new Error('Event not found');
        }

        setEvent({ _id: eventData.eventId, name: eventData.eventName });
        setAssignedLogos(eventData.logos || eventData.data?.logos || {});

        const logosResponse = await fetch('/api/logos?active=true&limit=100');
        const logosData: LogosResponse = await logosResponse.json();
        if (!logosResponse.ok) {
          throw new Error(logosData.error || 'Failed to load logos');
        }
        setAvailableLogos(logosData.logos || logosData.data?.logos || []);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [eventId]);

  const handleAssignLogo = async (logoId: string, scenario: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/logos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoId, scenario, isActive: true }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign logo');
      }
      await refreshAssignments(eventId);
    } catch (assignError) {
      alert(getErrorMessage(assignError));
    }
  };

  const handleRemoveLogo = async (logoId: string) => {
    if (!confirm('Remove this logo from the event?')) return;

    try {
      const response = await fetch(`/api/events/${eventId}/logos/${logoId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove logo');
      }
      await refreshAssignments(eventId);
    } catch (removeError) {
      alert(getErrorMessage(removeError));
    }
  };

  const handleToggleLogo = async (logoId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/logos/${logoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle' }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle logo');
      }
      await refreshAssignments(eventId);
    } catch (toggleError) {
      alert(getErrorMessage(toggleError));
    }
  };

  if (isLoading) {
    return (
      <Stack align="center" justify="center" mih="50vh">
        <Text fz={40}>⏳</Text>
        <Text c="dimmed">Loading logos...</Text>
      </Stack>
    );
  }

  if (error || !event) {
    return (
      <Stack gap="lg">
        <Alert icon={<IconAlertCircle size={16} />}>
          <Text fw={700}>Error</Text>
          <Text size="sm">{error || 'Event not found'}</Text>
        </Alert>
        <Link href="/admin/events">← Back to Events</Link>
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      <Breadcrumbs>
        <Link href="/admin/events">Events</Link>
        <Link href={`/admin/events/${eventId}`}>{event.name}</Link>
        <Text>Logos</Text>
      </Breadcrumbs>

      <WorkspaceHeader
        eyebrow="Events App"
        title="Manage Event Logos"
        description={`Assign logos to scenarios for ${event.name}`}
      />

      <Text size="sm" c="dimmed">
        💡 Multiple active logos per scenario = random selection on each display
      </Text>

      <Stack gap="lg">
        {SCENARIOS.map((scenario) => {
          const scenarioLogos = assignedLogos[scenario.id] || [];
          const assignedLogoIds = scenarioLogos.map((logo) => logo.logoId);
          const unassignedLogos = availableLogos.filter((logo) => !assignedLogoIds.includes(logo.logoId));

          return (
            <Card key={scenario.id} p={0}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
                <Title order={3}>{scenario.name}</Title>
                <Text size="sm" c="dimmed" mt="xs">
                  {scenario.description}
                </Text>
              </div>

              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" p="lg">
                <Stack gap="sm">
                  <Text size="sm" fw={600}>
                    Assigned ({scenarioLogos.length})
                  </Text>
                  {scenarioLogos.length === 0 ? (
                    <Card withBorder radius="md" bg="var(--mantine-color-gray-0)">
                      <Text c="dimmed" ta="center" py="xl">
                        No logos assigned
                      </Text>
                    </Card>
                  ) : (
                    scenarioLogos.map((logo) => (
                      <Card key={logo.logoId} withBorder radius="md" bg="var(--mantine-color-gray-0)">
                        <Group justify="space-between" align="center">
                          <Group gap="md">
                            <Image src={logo.thumbnailUrl} alt={logo.name} width={48} height={48} unoptimized style={{ width: 48, height: 48, objectFit: 'contain' }} />
                            <Text size="sm" fw={600}>
                              {logo.name}
                            </Text>
                          </Group>
                          <Group gap="sm">
                            <Button variant="light" color={logo.isActive ? 'green' : 'gray'} size="xs" onClick={() => void handleToggleLogo(logo.logoId)}>
                              {logo.isActive ? '● Active' : '○ Inactive'}
                            </Button>
                            <Button variant="subtle" size="xs" onClick={() => void handleRemoveLogo(logo.logoId)}>
                              Remove
                            </Button>
                          </Group>
                        </Group>
                      </Card>
                    ))
                  )}
                </Stack>

                <Stack gap="sm">
                  <Text size="sm" fw={600}>
                    Available ({unassignedLogos.length})
                  </Text>
                  {unassignedLogos.length === 0 ? (
                    <Card withBorder radius="md" bg="var(--mantine-color-gray-0)">
                      <Text c="dimmed" ta="center" py="xl">
                        All logos are assigned
                      </Text>
                    </Card>
                  ) : (
                    unassignedLogos.map((logo) => (
                      <Card key={logo.logoId} withBorder radius="md" bg="var(--mantine-color-gray-0)">
                        <Group justify="space-between" align="center">
                          <Group gap="md">
                            <Image src={logo.thumbnailUrl} alt={logo.name} width={48} height={48} unoptimized style={{ width: 48, height: 48, objectFit: 'contain' }} />
                            <Text size="sm" fw={600}>
                              {logo.name}
                            </Text>
                          </Group>
                          <Button size="xs" onClick={() => void handleAssignLogo(logo.logoId, scenario.id)}>
                            Assign
                          </Button>
                        </Group>
                      </Card>
                    ))
                  )}
                </Stack>
              </SimpleGrid>
            </Card>
          );
        })}
      </Stack>

      <Link href={`/admin/events/${eventId}`}>← Back to Event</Link>
    </Stack>
  );
}
