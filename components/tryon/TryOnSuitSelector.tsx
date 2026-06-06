'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MediaCard from '@/components/media/MediaPreviewCard';
import { StateBlock } from '@doneisbetter/gds-core/client';
import { Alert, Button, Group, Select, Stack, Text } from '@mantine/core';

interface TryOnSuitOption {
  id: string;
  name: string;
  previewUrl?: string | null;
  category: string;
}

interface TryOnSuitSelectorProps {
  selectedSuitId: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  eventMongoId?: string | null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load available leather suits.';
}

export default function TryOnSuitSelector({
  selectedSuitId,
  onChange,
  disabled = false,
  eventMongoId = null,
}: TryOnSuitSelectorProps) {
  const [suits, setSuits] = useState<TryOnSuitOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSuit = useMemo(
    () => suits.find((suit) => suit.id === selectedSuitId) ?? null,
    [selectedSuitId, suits]
  );

  const loadSuits = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const query = eventMongoId ? `?eventId=${encodeURIComponent(eventMongoId)}` : '';
      const response = await fetch(`/api/tryon/suits${query}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Suit catalog request failed with ${response.status}`);
      }

      const payload = await response.json();
      setSuits(payload.data?.suits ?? payload.suits ?? []);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError));
      setSuits([]);
    } finally {
      setIsLoading(false);
    }
  }, [eventMongoId]);

  useEffect(() => {
    void loadSuits();
  }, [loadSuits]);

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading leather suits..." />;
  }

  if (error) {
    return (
      <StateBlock
        variant="error"
        title="Leather suits are unavailable right now"
        description={error}
        action={
          <Button variant="light" onClick={() => void loadSuits()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (suits.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title="No leather suits are available"
        description="Try-on is currently unavailable because the suit catalog is empty."
      />
    );
  }

  return (
    <Stack gap="sm">
      <Select
        label="Leather jersey"
        placeholder="Select a leather jersey for try-on"
        clearable
        disabled={disabled}
        data={suits.map((suit) => ({
          value: suit.id,
          label: suit.name,
        }))}
        value={selectedSuitId}
        onChange={onChange}
        aria-label="Select leather jersey for try-on"
        styles={{ label: { fontWeight: 700 } }}
      />

      <Alert variant="light">
        <Text size="sm">
          Leave this empty to save a normal Camera submission only. Select a jersey to queue a try-on job after the
          image is saved.
        </Text>
      </Alert>

      {selectedSuit ? (
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text fw={600}>{selectedSuit.name}</Text>
            <Text size="xs" c="dimmed">
              {selectedSuit.category.replace(/_/g, ' ')}
            </Text>
          </Group>
          {selectedSuit.previewUrl ? (
            <MediaCard
              src={selectedSuit.previewUrl}
              alt={selectedSuit.name}
              caption="Selected leather jersey preview"
              ratio={1}
              fit="contain"
            />
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
