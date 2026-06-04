/**
 * Event Gallery Client Component
 *
 * Client-side wrapper for event submission gallery with inline remove and bulk selection.
 */

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import EventGalleryUpload from './EventGalleryUpload';

interface SlideshowPlayInfo {
  count: number;
}

interface SubmissionRecord {
  _id: string;
  imageUrl?: string;
  finalImageUrl?: string;
  userName?: string;
  userInfo?: {
    name?: string | null;
    email?: string | null;
  } | null;
  userEmail?: string;
  createdAt: string;
  playCount?: number;
  slideshowPlays?: Record<string, SlideshowPlayInfo | undefined>;
}

interface SlideshowRecord {
  slideshowId: string;
  name: string;
}

interface EventGalleryProps {
  eventId: string;
  eventName: string;
  initialSubmissions: SubmissionRecord[];
  slideshows: SlideshowRecord[];
}

type RemoveState = {
  singleConfirmId: string | null;
  bulkConfirm: boolean;
  busyIds: string[];
  error: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getDisplayName(submission: SubmissionRecord): string {
  return (
    readString(submission.userInfo?.name) ||
    readString(submission.userName) ||
    readString(submission.userEmail) ||
    'Event Guest'
  );
}

function submissionIdOf(submission: SubmissionRecord): string {
  return submission._id.toString();
}

export default function EventGallery({
  eventId,
  eventName,
  initialSubmissions,
  slideshows
}: EventGalleryProps) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removeState, setRemoveState] = useState<RemoveState>({
    singleConfirmId: null,
    bulkConfirm: false,
    busyIds: [],
    error: null,
  });

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleIds = useMemo(
    () => submissions.map((submission) => submissionIdOf(submission)),
    [submissions]
  );
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedSet.has(id));

  const handleRemoveSuccess = (submissionIds: string[]) => {
    const idSet = new Set(submissionIds);
    setSubmissions((prev) =>
      prev.filter((submission) => !idSet.has(submissionIdOf(submission)))
    );
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
    setRemoveState({
      singleConfirmId: null,
      bulkConfirm: false,
      busyIds: [],
      error: null,
    });
  };

  const handleUploaded = (submission: Record<string, unknown>) => {
    setSubmissions((prev) => [submission as unknown as SubmissionRecord, ...prev].slice(0, 50));
  };

  const toggleSelected = (submissionId: string) => {
    setSelectedIds((prev) =>
      prev.includes(submissionId)
        ? prev.filter((id) => id !== submissionId)
        : [...prev, submissionId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : allVisibleIds);
    setRemoveState((prev) => ({
      ...prev,
      bulkConfirm: false,
      error: null,
    }));
  };

  const removeFromEvent = async (submissionIds: string[]) => {
    if (submissionIds.length === 0) return;

    setRemoveState((prev) => ({
      ...prev,
      busyIds: submissionIds,
      error: null,
    }));

    try {
      const response = await fetch(
        `/api/events/${eventId}/submissions/bulk-remove`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionIds }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
              ? data.message
              : 'Failed to remove submissions from event'
        );
      }

      handleRemoveSuccess(submissionIds);
    } catch (error) {
      setRemoveState((prev) => ({
        ...prev,
        busyIds: [],
        error:
          error instanceof Error
            ? error.message
            : 'Failed to remove submissions from event',
      }));
    }
  };

  const startSingleConfirm = (submissionId: string) => {
    setRemoveState((prev) => ({
      ...prev,
      singleConfirmId: submissionId,
      error: null,
    }));
  };

  const cancelSingleConfirm = () => {
    setRemoveState((prev) => ({
      ...prev,
      singleConfirmId: null,
      error: null,
    }));
  };

  const startBulkConfirm = () => {
    setRemoveState((prev) => ({
      ...prev,
      bulkConfirm: true,
      error: null,
    }));
  };

  const cancelBulkConfirm = () => {
    setRemoveState((prev) => ({
      ...prev,
      bulkConfirm: false,
      error: null,
    }));
  };

  if (submissions.length === 0) {
    return (
      <Stack gap="lg" p="xl">
        <EventGalleryUpload
          eventMongoId={eventId}
          onUploaded={handleUploaded}
        />
        <Card withBorder radius="lg" p="xl">
          <Stack align="center" gap="md">
            <Text fz="3rem" aria-hidden>📸</Text>
            <Title order={3}>
            No submissions yet
            </Title>
            <Text c="dimmed" ta="center">
            Upload images above or open the public capture page for guests
            </Text>
            <Button
              component={Link}
            href={`/capture/${eventId}`}
          >
              Start Capturing
            </Button>
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" p="xl">
      <EventGalleryUpload
        eventMongoId={eventId}
        onUploaded={handleUploaded}
      />

      <Card withBorder radius="lg" p="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text size="sm" fw={700}>
              Gallery actions
            </Text>
            <Text size="xs" c="dimmed">
              Select multiple images and remove them from {eventName} in one action.
            </Text>
          </Stack>
          <Group gap="xs">
            <Button
              type="button"
              onClick={toggleSelectAll}
              variant="default"
            >
              {allSelected ? 'Clear selection' : 'Select all visible'}
            </Button>
            {selectedIds.length > 0 ? (
              removeState.bulkConfirm ? (
                <>
                  <Button
                    type="button"
                    onClick={() => void removeFromEvent(selectedIds)}
                    disabled={removeState.busyIds.length > 0}
                    variant="light"
                  >
                    {removeState.busyIds.length > 0
                      ? 'Removing selected…'
                      : `Confirm remove ${selectedIds.length}`}
                  </Button>
                  <Button
                    type="button"
                    onClick={cancelBulkConfirm}
                    disabled={removeState.busyIds.length > 0}
                    variant="default"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={startBulkConfirm}
                  variant="light"
                >
                  Remove selected ({selectedIds.length})
                </Button>
              )
            ) : null}
          </Group>
        </Group>

        {removeState.error ? (
          <Alert mt="md" variant="light">
            {removeState.error}
          </Alert>
        ) : null}
      </Card>

      <SimpleGrid cols={{ base: 2, md: 3, lg: 4, xl: 5 }} spacing="md">
        {submissions.map((submission) => {
          const submissionId = submissionIdOf(submission);
          const selected = selectedSet.has(submissionId);
          const singleConfirm = removeState.singleConfirmId === submissionId;
          const busy = removeState.busyIds.includes(submissionId);
          const displayName = getDisplayName(submission);

          return (
            <Card
              key={submissionId}
              withBorder
              radius="md"
              p={0}
            >
              <Stack gap={0}>
                <div style={{ position: 'relative' }}>
                  <Checkbox
                    checked={selected}
                    onChange={() => toggleSelected(submissionId)}
                    aria-label={selected ? 'Deselect image' : 'Select image'}
                    style={{ position: 'absolute', zIndex: 1, insetBlockStart: 8, insetInlineStart: 8 }}
                  />
                  <Link href={`/share/${submission._id}`}>
                  <Image
                  src={submission.imageUrl || submission.finalImageUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}
                  alt={`Photo of ${displayName}`}
                  width={800}
                  height={800}
                  unoptimized
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </Link>
                </div>

                <Stack gap="xs" p="sm">
                  <Text size="xs" fw={600} truncate>
                    {displayName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {new Date(submission.createdAt).toLocaleDateString()}
                  </Text>
                  {typeof submission.playCount === 'number' && submission.playCount > 0 ? (
                    <Text size="xs" c="dimmed">Played {submission.playCount} times</Text>
                  ) : null}

                  {submission.slideshowPlays && Object.keys(submission.slideshowPlays).length > 0 && (
                    <Stack gap={2}>
                      {slideshows.map((slideshow) => {
                        const plays = submission.slideshowPlays?.[slideshow.slideshowId];
                        if (!plays || plays.count === 0) return null;
                        return (
                          <Text key={slideshow.slideshowId} size="xs" c="dimmed">
                            {slideshow.name}: {plays.count}x
                          </Text>
                        );
                      })}
                    </Stack>
                  )}

                  <Group gap="xs" grow>
                    <Button
                      component={Link}
                      href={`/share/${submission._id}`}
                      size="xs"
                      variant="light"
                    >
                      View
                    </Button>
                    {singleConfirm ? (
                      <>
                        <Button
                          type="button"
                          onClick={() => void removeFromEvent([submissionId])}
                          disabled={busy}
                          size="xs"
                          variant="light"
                        >
                          {busy ? 'Removing…' : 'Confirm remove'}
                        </Button>
                        <Button
                          type="button"
                          onClick={cancelSingleConfirm}
                          disabled={busy}
                          size="xs"
                          variant="default"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => startSingleConfirm(submissionId)}
                        size="xs"
                        variant="light"
                      >
                        Remove from Event
                      </Button>
                    )}
                  </Group>
                </Stack>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>

      {submissions.length >= 50 && (
        <Text ta="center" size="sm" c="dimmed">
          Showing the 50 most recent submissions
        </Text>
      )}
    </Stack>
  );
}
