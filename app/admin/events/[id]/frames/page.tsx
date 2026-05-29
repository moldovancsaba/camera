'use client';

/**
 * Event Frame Management Page
 *
 * Manage frame assignments for an event.
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

interface EventFrameAssignment {
  frameId: string;
  isActive: boolean;
}

interface EventRecord {
  name: string;
  frames?: EventFrameAssignment[];
}

interface FrameRecord {
  frameId: string;
  name: string;
  thumbnailUrl?: string;
  hashtags?: string[];
}

interface EventResponse {
  data?: { event?: EventRecord };
  event?: EventRecord;
  error?: string;
}

interface FramesResponse {
  data?: { frames?: FrameRecord[] };
  error?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function EventFramesPage({ params }: { params: Promise<{ id: string }> }) {
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [availableFrames, setAvailableFrames] = useState<FrameRecord[]>([]);
  const [assignedFrames, setAssignedFrames] = useState<EventFrameAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolved) => setEventId(resolved.id));
  }, [params]);

  useEffect(() => {
    if (!eventId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const eventResponse = await fetch(`/api/events/${eventId}`);
        const eventData: EventResponse = await eventResponse.json();
        if (!eventResponse.ok) {
          throw new Error(eventData.error || 'Failed to load event');
        }

        const eventRecord = eventData.data?.event || eventData.event;
        if (!eventRecord) {
          throw new Error('Event not found');
        }
        setEvent(eventRecord);
        setAssignedFrames(eventRecord.frames || []);

        const framesResponse = await fetch('/api/frames?active=true&limit=100');
        const framesData: FramesResponse = await framesResponse.json();
        if (!framesResponse.ok) {
          throw new Error(framesData.error || 'Failed to load frames');
        }
        setAvailableFrames(framesData.data?.frames || []);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [eventId]);

  const refreshEvent = async () => {
    const eventResponse = await fetch(`/api/events/${eventId}`);
    const eventData: EventResponse = await eventResponse.json();
    const eventRecord = eventData.data?.event || eventData.event;
    if (!eventRecord) {
      throw new Error('Event not found');
    }
    setEvent(eventRecord);
    setAssignedFrames(eventRecord.frames || []);
  };

  const handleAssignFrame = async (frameId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameId, isActive: true }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to assign frame');
      }
      await refreshEvent();
    } catch (assignError) {
      alert(getErrorMessage(assignError));
    }
  };

  const handleRemoveFrame = async (frameId: string) => {
    if (!confirm('Remove this frame from the event?')) return;

    try {
      const response = await fetch(`/api/events/${eventId}/frames/${frameId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove frame');
      }
      await refreshEvent();
    } catch (removeError) {
      alert(getErrorMessage(removeError));
    }
  };

  const handleToggleFrame = async (frameId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/frames/${frameId}/toggle`, { method: 'PATCH' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle frame');
      }
      await refreshEvent();
    } catch (toggleError) {
      alert(getErrorMessage(toggleError));
    }
  };

  if (isLoading) {
    return (
      <Stack align="center" justify="center" mih="50vh">
        <Text fz={40}>⏳</Text>
        <Text c="dimmed">Loading frames...</Text>
      </Stack>
    );
  }

  if (error || !event) {
    return (
      <Stack gap="lg">
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          <Text fw={700}>Error</Text>
          <Text size="sm">{error || 'Event not found'}</Text>
        </Alert>
        <Link href="/admin/events">← Back to Events</Link>
      </Stack>
    );
  }

  const assignedFrameIds = assignedFrames.map((frame) => frame.frameId);
  const unassignedFrames = availableFrames.filter((frame) => !assignedFrameIds.includes(frame.frameId));

  return (
    <Stack gap="xl">
      <Breadcrumbs>
        <Link href="/admin/events">Events</Link>
        <Link href={`/admin/events/${eventId}`}>{event.name}</Link>
        <Text>Frames</Text>
      </Breadcrumbs>

      <WorkspaceHeader
        eyebrow="Events App"
        title="Manage Event Frames"
        description={`Assign and manage frames for ${event.name}`}
      />

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Card p={0}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
            <Title order={3}>Assigned Frames ({assignedFrames.length})</Title>
          </div>
          <Stack gap="sm" p="lg">
            {assignedFrames.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                No frames assigned yet
              </Text>
            ) : (
              assignedFrames.map((frameAssignment) => {
                const frame = availableFrames.find((availableFrame) => availableFrame.frameId === frameAssignment.frameId);
                return (
                  <Card key={frameAssignment.frameId} withBorder radius="md" bg="var(--mantine-color-gray-0)">
                    <Group justify="space-between" align="center">
                      <Group gap="md">
                        {frame?.thumbnailUrl ? (
                          <Image src={frame.thumbnailUrl} alt={frame.name} width={64} height={64} unoptimized style={{ width: 64, height: 'auto', objectFit: 'contain' }} />
                        ) : (
                          <Text fz={28}>🖼️</Text>
                        )}
                        <div>
                          <Text size="sm" fw={600}>
                            {frame?.name || frameAssignment.frameId}
                          </Text>
                          <Text size="xs" c="dimmed" ff="monospace">
                            {frameAssignment.frameId}
                          </Text>
                        </div>
                      </Group>
                      <Group gap="sm">
                        <Button
                          variant="light"
                          color={frameAssignment.isActive ? 'green' : 'gray'}
                          size="xs"
                          onClick={() => void handleToggleFrame(frameAssignment.frameId)}
                        >
                          {frameAssignment.isActive ? '● Active' : '○ Inactive'}
                        </Button>
                        <Button variant="subtle" color="red" size="xs" onClick={() => void handleRemoveFrame(frameAssignment.frameId)}>
                          Remove
                        </Button>
                      </Group>
                    </Group>
                  </Card>
                );
              })
            )}
          </Stack>
        </Card>

        <Card p={0}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
            <Title order={3}>Available Frames ({unassignedFrames.length})</Title>
          </div>
          <Stack gap="sm" p="lg">
            {unassignedFrames.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                All frames are assigned
              </Text>
            ) : (
              unassignedFrames.map((frame) => (
                <Card key={frame.frameId} withBorder radius="md" bg="var(--mantine-color-gray-0)">
                  <Group justify="space-between" align="center">
                    <Group gap="md">
                      {frame.thumbnailUrl ? (
                        <Image src={frame.thumbnailUrl} alt={frame.name} width={64} height={64} unoptimized style={{ width: 64, height: 'auto', objectFit: 'contain' }} />
                      ) : (
                        <Text fz={28}>🖼️</Text>
                      )}
                      <div>
                        <Text size="sm" fw={600}>
                          {frame.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {frame.hashtags?.join(', ') || 'No hashtags'}
                        </Text>
                      </div>
                    </Group>
                    <Button size="xs" onClick={() => void handleAssignFrame(frame.frameId)}>
                      Assign
                    </Button>
                  </Group>
                </Card>
              ))
            )}
          </Stack>
        </Card>
      </SimpleGrid>

      <Link href={`/admin/events/${eventId}`}>← Back to Event</Link>
    </Stack>
  );
}
