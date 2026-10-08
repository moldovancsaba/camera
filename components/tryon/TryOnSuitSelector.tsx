'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MediaCard from '@/components/media/MediaPreviewCard';
import { StateBlock } from '@sovereignsquad/gds-core/client';
import { Alert, Button, Group, Select, Stack, Text } from '@/components/gds/PublicPrimitives';
import { useT } from '@/components/i18n/UiLanguageProvider';
import type { MessageKey } from '@/lib/i18n';

const GARMENT_TYPE_KEYS: Record<string, MessageKey> = {
  motorsport_suit: 'tryon.garment.motorsport_suit',
  jersey: 'tryon.garment.jersey',
  top: 'tryon.garment.top',
  bottom: 'tryon.garment.bottom',
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

export default function TryOnSuitSelector({
  selectedSuitId,
  onChange,
  disabled = false,
  eventMongoId = null,
  outfitEnabled = false,
  selectedBottomSuitId = null,
  onBottomChange,
}: TryOnSuitSelectorProps) {
  const { t } = useT();
  const garmentLabel = (type: string) => (GARMENT_TYPE_KEYS[type] ? t(GARMENT_TYPE_KEYS[type]) : type.replace(/_/g, ' '));
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
        throw new Error(t('tryon.catalogFailed', { status: response.status }));
      }

      const payload = await response.json();
      setSuits(payload.data?.suits ?? payload.suits ?? []);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : t('tryon.loadFailed'));
      setSuits([]);
    } finally {
      setIsLoading(false);
    }
  }, [eventMongoId, t]);

  useEffect(() => {
    void loadSuits();
  }, [loadSuits]);

  if (isLoading) {
    return <StateBlock variant="loading" title={t('tryon.loading')} />;
  }

  if (error) {
    return (
      <StateBlock
        variant="error"
        title={t('tryon.unavailable')}
        description={error}
        action={
          <Button variant="light" onClick={() => void loadSuits()}>
            {t('tryon.retry')}
          </Button>
        }
      />
    );
  }

  if (suits.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title={t('tryon.none')}
        description={t('tryon.noneText')}
      />
    );
  }

  return (
    <Stack gap="sm">
      <Select
        label={t('tryon.jersey.label')}
        placeholder={t('tryon.jersey.placeholder')}
        clearable
        disabled={disabled}
        data={suits.map((suit) => ({
          value: suit.id,
          label: suit.name,
        }))}
        value={selectedSuitId}
        onChange={onChange}
        aria-label={t('tryon.jersey.aria')}
        styles={{ label: { fontWeight: 700 } }}
      />

      <Alert variant="light">
        <Text size="sm">
          {t('tryon.hint')}
        </Text>
      </Alert>

      {selectedSuit ? (
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text fw={600}>{selectedSuit.name}</Text>
            <Text size="xs" c="dimmed">
              {garmentLabel(selectedSuit.garmentType)}
            </Text>
          </Group>
          {selectedSuit.previewUrl ? (
            <MediaCard
              src={selectedSuit.previewUrl}
              alt={t('tryon.preview.alt', { name: selectedSuit.name })}
              caption={t('tryon.preview.garment')}
              ratio={1}
              fit="contain"
            />
          ) : null}
        </Stack>
      ) : null}

      {showBottomPicker ? (
        <Stack gap="xs">
          <Select
            label={t('tryon.bottom.label')}
            placeholder={t('tryon.bottom.placeholder')}
            clearable
            disabled={disabled}
            data={bottomOptions.map((suit) => ({
              value: suit.id,
              label: suit.name,
            }))}
            value={selectedBottomSuitId}
            onChange={(value) => onBottomChange?.(value)}
            aria-label={t('tryon.bottom.aria')}
            styles={{ label: { fontWeight: 700 } }}
          />
          {selectedBottom ? (
            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text fw={600}>{selectedBottom.name}</Text>
                <Text size="xs" c="dimmed">
                  {garmentLabel(selectedBottom.garmentType)}
                </Text>
              </Group>
              {selectedBottom.previewUrl ? (
                <MediaCard
                  src={selectedBottom.previewUrl}
                  alt={t('tryon.preview.alt', { name: selectedBottom.name })}
                  caption={t('tryon.preview.bottom')}
                  ratio={1}
                  fit="contain"
                />
              ) : null}
              <Alert variant="light">
                <Text size="sm">{t('tryon.outfitNote')}</Text>
              </Alert>
            </Stack>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
