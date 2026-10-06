'use client';

import { PublicFlowShell } from '@sovereignsquad/gds-core/client';
import { Alert, Anchor, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';

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
  overlay?: boolean;
  buttonSize?: EventButtonSize;
}

function TryOnStatusNotice({ tryOnResult }: { tryOnResult?: TryOnStatus | null }) {
  if (!tryOnResult?.requested) return null;

  const isQueued =
    tryOnResult.status === 'queued' || tryOnResult.status === 'deduplicated';

  return (
    <Alert color={isQueued ? 'blue' : 'yellow'} variant="light">
      {isQueued ? (
        <>
          <Text fw={700}>Try-on queued</Text>
          <Text size="sm">Job ID: {tryOnResult.jobId}</Text>
        </>
      ) : (
        <>
          <Text fw={700}>Try-on was not queued</Text>
          <Text size="sm">
            {tryOnResult.error || 'The image was saved, but the try-on queue step failed.'}
          </Text>
        </>
      )}
    </Alert>
  );
}

export default function ShareOverlay({
  shareUrl,
  title = 'Share Your Photo',
  copyButtonText = 'Copy',
  viewPhotoButtonText = 'View your photo (opens share link)',
  suggestedMessageLabel = 'Suggested message:',
  shareCaption,
  tryOnResult,
  nextButtonText,
  completionMessage,
  onCopyLink,
  onShareSocial,
  onNext,
  showShareActions = true,
  overlay = true,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
}: ShareOverlayProps) {
  // Safe centring (camera#222): the card is centred when it fits and scrolls inside itself when the
  // screen is shorter than the card, instead of being clipped at both ends.
  const shellClassName = overlay
    ? 'absolute inset-0 overflow-y-auto bg-black/55 backdrop-blur-sm'
    : '';
  const centerClassName = overlay
    ? 'flex min-h-full items-center justify-center p-4 landscape:p-2'
    : '';
  const panelClassName = overlay
    ? 'w-full max-w-xl text-left'
    : '';

  return (
    <div className={shellClassName}>
      <div className={centerClassName}>
        <div className={panelClassName}>
          <PublicFlowShell
            eyebrow="Capture flow"
            stage={{
              id: 'share-stage',
              title,
              status: 'ready',
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
