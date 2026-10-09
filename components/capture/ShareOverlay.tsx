'use client';

import { PublicFlowShell } from '@sovereignsquad/gds-core/client';
import { Alert, Anchor, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';
import { useT } from '@/components/i18n/UiLanguageProvider';

interface TryOnStatus {
  requested: boolean;
  status: 'not_requested' | 'queued' | 'deduplicated' | 'enqueue_failed';
  jobId: string | null;
  error: string | null;
}

interface ShareOverlayProps {
  shareUrl?: string | null;
  title?: string;
  copyButtonText?: string;
  viewPhotoButtonText?: string;
  suggestedMessageLabel?: string;
  shareCaption: string;
  tryOnResult?: TryOnStatus | null;
  nextButtonText?: string;
  completionMessage?: string;
  onCopyLink?: () => void;
  onShareSocial?: (platform: 'facebook' | 'twitter' | 'linkedin' | 'whatsapp') => void;
  onNext?: () => void;
  showShareActions?: boolean;
  /** The status badge of the card: 'ready' for a photo that can be shared, 'complete' for one that is saved and waits (camera#265). */
  stageStatus?: 'ready' | 'complete';
  overlay?: boolean;
  buttonSize?: EventButtonSize;
}

function TryOnStatusNotice({ tryOnResult }: { tryOnResult?: TryOnStatus | null }) {
  const { t } = useT();
  if (!tryOnResult?.requested) return null;

  const isQueued =
    tryOnResult.status === 'queued' || tryOnResult.status === 'deduplicated';

  return (
    <Alert color={isQueued ? 'blue' : 'yellow'} variant="light">
      {isQueued ? (
        <>
          <Text fw={700}>{t('share.tryOn.queued')}</Text>
          <Text size="sm">{t('share.tryOn.job', { id: tryOnResult.jobId ?? '' })}</Text>
        </>
      ) : (
        <>
          <Text fw={700}>{t('share.tryOn.notQueued')}</Text>
          <Text size="sm">
            {tryOnResult.error || t('share.tryOn.failed')}
          </Text>
        </>
      )}
    </Alert>
  );
}

export default function ShareOverlay({
  shareUrl,
  title: titleProp,
  copyButtonText: copyButtonTextProp,
  viewPhotoButtonText: viewPhotoButtonTextProp,
  suggestedMessageLabel: suggestedMessageLabelProp,
  shareCaption,
  tryOnResult,
  nextButtonText,
  completionMessage,
  onCopyLink,
  onShareSocial,
  onNext,
  showShareActions = true,
  stageStatus = 'ready',
  overlay = true,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
}: ShareOverlayProps) {
  const { t } = useT();
  const title = titleProp ?? t('share.title');
  const copyButtonText = copyButtonTextProp ?? t('share.copy');
  const viewPhotoButtonText = viewPhotoButtonTextProp ?? t('share.view');
  const suggestedMessageLabel = suggestedMessageLabelProp ?? t('share.suggested');
  // Safe centring (camera#222): the card is centred when it fits and scrolls inside itself when the
  // screen is shorter than the card, instead of being clipped at both ends.
  // The veil, when there is one, is the page colour of the event, never black (owner, 2026-10-09: the dark veil was a colour of no theme).
  const shellClassName = overlay ? 'absolute inset-0 overflow-y-auto' : '';
  const shellStyle = overlay ? { background: 'color-mix(in srgb, var(--event-bg, var(--mantine-color-body)) 80%, transparent)', backdropFilter: 'blur(2px)' } : undefined;
  const centerClassName = overlay
    ? 'app-safe-pad flex min-h-full items-center justify-center'
    : '';
  const panelClassName = overlay
    ? 'w-full max-w-xl text-left'
    : '';

  return (
    <div className={shellClassName} style={shellStyle}>
      <div className={centerClassName}>
        <div className={panelClassName} data-event-stage>
          <PublicFlowShell
            stage={{
              id: 'share-stage',
              title,
              status: stageStatus,
              body: (
                <Stack gap="md">
                  {showShareActions && shareUrl ? (
                    <>
                      <Group align="stretch" gap="sm" wrap="nowrap" data-tour-id="capture-share-copy-link">
                        <TextInput
                          value={shareUrl}
                          readOnly
                          className="min-w-0 flex-1"
                          size="md"
                          radius="md"
                        />
                        <Button
                          type="button"
                          variant="light"
                          size={buttonSize}
                          radius="md"
                          className="shrink-0"
                          onClick={onCopyLink}
                        >
                          {copyButtonText}
                        </Button>
                      </Group>

                      <Anchor
                        href={shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="never"
                        data-tour-id="capture-share-view-photo"
                      >
                        <Button component="span" size={buttonSize} radius="xl" fullWidth>
                          {viewPhotoButtonText}
                        </Button>
                      </Anchor>

                      <Text ta="center" size="xs" c="dimmed">
                        {suggestedMessageLabel}{' '}
                        <Text component="span" fw={500}>
                          {shareCaption}
                        </Text>
                      </Text>
                    </>
                  ) : completionMessage ? (
                    <Text c="dimmed">{completionMessage}</Text>
                  ) : null}

                  <TryOnStatusNotice tryOnResult={tryOnResult} />

                  {showShareActions ? (
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 landscape:grid-cols-4">
                      <Button
                        type="button"
                        variant="light"
                        size={buttonSize}
                        fullWidth
                        px="xs"
                        radius="md"
                        onClick={() => onShareSocial?.('facebook')}
                      >
                        Facebook
                      </Button>
                      <Button
                        type="button"
                        variant="light"
                        size={buttonSize}
                        fullWidth
                        px="xs"
                        radius="md"
                        onClick={() => onShareSocial?.('twitter')}
                      >
                        Twitter
                      </Button>
                      <Button
                        type="button"
                        variant="light"
                        size={buttonSize}
                        fullWidth
                        px="xs"
                        radius="md"
                        onClick={() => onShareSocial?.('linkedin')}
                      >
                        LinkedIn
                      </Button>
                      <Button
                        type="button"
                        variant="light"
                        size={buttonSize}
                        fullWidth
                        px="xs"
                        radius="md"
                        onClick={() => onShareSocial?.('whatsapp')}
                      >
                        WhatsApp
                      </Button>
                    </div>
                  ) : null}

                  {nextButtonText && onNext ? (
                    <Button type="button" size={buttonSize} radius="xl" fullWidth onClick={onNext}>
                      {nextButtonText}
                    </Button>
                  ) : null}
                </Stack>
              ),
            }}
          />
        </div>
      </div>
    </div>
  );
}
