'use client';

import { PublicFlowShell } from '@doneisbetter/gds-core/client';
import { Anchor, Button, Group, Stack, Text, TextInput } from '@mantine/core';

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
}

function TryOnStatusNotice({ tryOnResult }: { tryOnResult?: TryOnStatus | null }) {
  if (!tryOnResult?.requested) return null;

  const isQueued =
    tryOnResult.status === 'queued' || tryOnResult.status === 'deduplicated';

  return (
    <div
      className={
        isQueued
          ? 'rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-100'
          : 'rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'
      }
    >
      {isQueued ? (
        <>
          <p className="font-semibold">Try-on queued</p>
          <p className="mt-1">
            Job ID: <span className="font-mono">{tryOnResult.jobId}</span>
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold">Try-on was not queued</p>
          <p className="mt-1">
            {tryOnResult.error || 'The image was saved, but the try-on queue step failed.'}
          </p>
        </>
      )}
    </div>
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
}: ShareOverlayProps) {
  const shellClassName = overlay
    ? 'absolute inset-0 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm'
    : '';
  const panelClassName = overlay
    ? 'w-full max-w-xl rounded-3xl border border-white/10 bg-black/80 p-6 text-left shadow-2xl backdrop-blur-xl'
    : '';

  return (
    <div className={shellClassName}>
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
                    <Group align="stretch" gap="sm" wrap="nowrap">
                      <TextInput
                        value={shareUrl}
                        readOnly
                        className="min-w-0 flex-1"
                        size="md"
                        radius="md"
                        styles={{
                          input: {
                            backgroundColor: overlay ? 'var(--mantine-color-dark-8)' : undefined,
                            color: overlay ? 'var(--mantine-color-white)' : undefined,
                            borderColor: overlay ? 'var(--mantine-color-dark-4)' : undefined,
                          },
                        }}
                      />
                      <Button
                        type="button"
                        variant="light"
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
                    >
                      <Button component="span" radius="xl" fullWidth>
                        {viewPhotoButtonText}
                      </Button>
                    </Anchor>

                    <Text ta="center" size="xs" c={overlay ? 'gray.3' : 'dimmed'}>
                      {suggestedMessageLabel}{' '}
                      <Text component="span" fw={500} c={overlay ? 'white' : undefined}>
                        {shareCaption}
                      </Text>
                    </Text>
                  </>
                ) : completionMessage ? (
                  <Text c={overlay ? 'gray.3' : 'dimmed'}>{completionMessage}</Text>
                ) : null}

                <TryOnStatusNotice tryOnResult={tryOnResult} />

                {showShareActions ? (
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <Button
                      type="button"
                      variant="light"
                      fullWidth
                      radius="md"
                      onClick={() => onShareSocial?.('facebook')}
                    >
                      Facebook
                    </Button>
                    <Button
                      type="button"
                      variant="light"
                      fullWidth
                      radius="md"
                      onClick={() => onShareSocial?.('twitter')}
                    >
                      Twitter
                    </Button>
                    <Button
                      type="button"
                      variant="light"
                      fullWidth
                      radius="md"
                      onClick={() => onShareSocial?.('linkedin')}
                    >
                      LinkedIn
                    </Button>
                    <Button
                      type="button"
                      variant="light"
                      fullWidth
                      radius="md"
                      onClick={() => onShareSocial?.('whatsapp')}
                    >
                      WhatsApp
                    </Button>
                  </div>
                ) : null}

                {nextButtonText && onNext ? (
                  <Button type="button" radius="xl" fullWidth onClick={onNext}>
                    {nextButtonText}
                  </Button>
                ) : null}
              </Stack>
            ),
          }}
        />
      </div>
    </div>
  );
}
