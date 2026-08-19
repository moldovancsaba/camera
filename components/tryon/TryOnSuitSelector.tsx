'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MediaCard from '@/components/media/MediaPreviewCard';
import { StateBlock } from '@sovereignsquad/gds-core/client';
import { Alert, Button, Group, Select, Stack, Text } from '@/components/gds/PublicPrimitives';

const GARMENT_TYPE_LABELS: Record<string, string> = {
  motorsport_suit: 'motorsport suit',
  jersey: 'jersey',
  top: 'top',
  bottom: 'bottom',
};

interface TryOnSuitOption {
  id: string;
  name: string;
  previewUrl?: string | null;
  garmentType: string;
}

interface TryOnSuitSelectorProps {
  selectedSuitId: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  eventMongoId?: string | null;
  // Outfit pairing (camera#116, try-on#39 contract). All optional so the
  // eventless capture flow - which has no outfitEnabled policy - is
  // untouched: without these props the selector behaves exactly as before.
  outfitEnabled?: boolean;
  selectedBottomSuitId?: string | null;
  onBottomChange?: (value: string | null) => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load available leather suits.';
}

export default function TryOnSuitSelector({
  selectedSuitId,
  onChange,
  disabled = false,
  eventMongoId = null,
  outfitEnabled = false,
  selectedBottomSuitId = null,
  onBottomChange,
}: TryOnSuitSelectorProps) {
  const [suits, setSuits] = useState<TryOnSuitOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSuit = useMemo(
    () => suits.find((suit) => suit.id === selectedSuitId) ?? null,
    [selectedSuitId, suits]
  );

  const bottomOptions = useMemo(
    () => suits.filter((suit) => suit.garmentType === 'bottom'),
    [suits]
  );
  const showBottomPicker =
    outfitEnabled && Boolean(onBottomChange) && selectedSuit?.garmentType === 'top' && bottomOptions.length > 0;
  const selectedBottom = useMemo(
    () => (showBottomPicker ? bottomOptions.find((suit) => suit.id === selectedBottomSuitId) ?? null : null),
    [bottomOptions, selectedBottomSuitId, showBottomPicker]
  );

  // A pairing is per-top, not sticky: changing (or clearing) the top away
  // from a 'top'-type garment resets any chosen bottom, so a stale pairing
  // can never ride along into a submit.
  useEffect(() => {
    if (!onBottomChange || !selectedBottomSuitId) return;
    if (selectedSuit?.garmentType !== 'top') {
      onBottomChange(null);
    }
  }, [onBottomChange, selectedBottomSuitId, selectedSuit]);

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
              {GARMENT_TYPE_LABELS[selectedSuit.garmentType] || selectedSuit.garmentType.replace(/_/g, ' ')}
            </Text>
          </Group>
          {selectedSuit.previewUrl ? (
            <MediaCard
              src={selectedSuit.previewUrl}
              alt={`${selectedSuit.name} preview`}
              caption="Selected garment preview"
              ratio={1}
              fit="contain"
            />
          ) : null}
        </Stack>
      ) : null}

      {showBottomPicker ? (
        <Stack gap="xs">
          <Select
            label="Complete the outfit — add a bottom (optional)"
            placeholder="Select a matching bottom"
            clearable
            disabled={disabled}
            data={bottomOptions.map((suit) => ({
              value: suit.id,
              label: suit.name,
            }))}
            value={selectedBottomSuitId}
            onChange={(value) => onBottomChange?.(value)}
            aria-label="Select a bottom to complete the outfit"
            styles={{ label: { fontWeight: 700 } }}
          />
          {selectedBottom ? (
            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text fw={600}>{selectedBottom.name}</Text>
                <Text size="xs" c="dimmed">
                  {GARMENT_TYPE_LABELS[selectedBottom.garmentType] || selectedBottom.garmentType}
                </Text>
              </Group>
              {selectedBottom.previewUrl ? (
                <MediaCard
                  src={selectedBottom.previewUrl}
                  alt={`${selectedBottom.name} preview`}
                  caption="Selected bottom preview"
                  ratio={1}
                  fit="contain"
                />
              ) : null}
              <Alert variant="light">
                <Text size="sm">Outfit renders take about twice as long as a single garment.</Text>
              </Alert>
            </Stack>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
