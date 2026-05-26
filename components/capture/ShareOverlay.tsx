'use client';

import { AppButton } from '@/components/ui/AppButton';

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
  const panelClassName = overlay ? 'app-raised-dialog max-w-xl text-left' : 'space-y-4';

  return (
    <div className={shellClassName}>
      <div className={panelClassName}>
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="app-raised-dialog-title mb-0">{title}</h3>
          </div>

          {showShareActions && shareUrl ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="app-form-control min-w-0 flex-1 text-sm"
                />
                <AppButton
                  type="button"
                  variant="ghost"
                  compact
                  className="app-btn--inline shrink-0"
                  onClick={onCopyLink}
                >
                  {copyButtonText}
                </AppButton>
              </div>

              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="app-btn app-btn--primary app-btn--inline max-w-none text-center"
              >
                {viewPhotoButtonText}
              </a>

              <p className="text-center text-xs text-[var(--app-panel-body)]">
                {suggestedMessageLabel}{' '}
                <span className="font-medium text-[var(--app-panel-strong)]">{shareCaption}</span>
              </p>
            </>
          ) : completionMessage ? (
            <p className="app-raised-dialog-body mb-0">{completionMessage}</p>
          ) : null}

          <TryOnStatusNotice tryOnResult={tryOnResult} />

          {showShareActions ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <AppButton
                type="button"
                variant="secondary"
                className="app-btn--inline w-full min-w-0"
                onClick={() => onShareSocial?.('facebook')}
              >
                Facebook
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                className="app-btn--inline w-full min-w-0"
                onClick={() => onShareSocial?.('twitter')}
              >
                Twitter
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                className="app-btn--inline w-full min-w-0"
                onClick={() => onShareSocial?.('linkedin')}
              >
                LinkedIn
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                className="app-btn--inline w-full min-w-0"
                onClick={() => onShareSocial?.('whatsapp')}
              >
                WhatsApp
              </AppButton>
            </div>
          ) : null}

          {nextButtonText && onNext ? (
            <AppButton type="button" variant="primary" className="app-btn--block" onClick={onNext}>
              {nextButtonText}
            </AppButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
