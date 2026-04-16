'use client';

import { useState } from 'react';
import CameraCapture from '@/components/camera/CameraCapture';
import { AppButton } from '@/components/ui/AppButton';
import { compositeFramedSelfieWithText } from '@/components/funfitfan/composite-framed-selfie';
import { FUNFITFAN_PARTNER_ID, FUNFITFAN_PARTNER_NAME } from '@/lib/funfitfan/constants';
import { formatFeelSoLine } from '@/lib/funfitfan/feel-so-tags';
import { openSlideshowInNewTab } from '@/lib/slideshow/open-slideshow';

export type CheckinBootstrapCtx = {
  eventUuid: string;
  eventName: string;
  slideshowId: string;
  frame: {
    frameId: string;
    name: string;
    fileUrl: string;
    imageUrl?: string;
    width: number;
    height: number;
  };
};

type Props = {
  ctx: CheckinBootstrapCtx;
  activity: string;
  feelSoTags: string[];
  onCancel: () => void;
  /** Called after submission is saved (e.g. mark gym session complete). Receives imgbb image URL. */
  onAfterSubmissionSaved?: (imageUrl: string) => Promise<void>;
};

/**
 * Same flow as FunFitFan log after “Take selfie”: camera → composite preview → Save to reel → Saved.
 * Used from `/fff/log` (historically) and gym workout selfie completion.
 */
export default function FunFitFanCheckinSelfieReelFlow({
  ctx,
  activity,
  feelSoTags,
  onCancel,
  onAfterSubmissionSaved,
}: Props) {
  const [step, setStep] = useState<'selfie' | 'preview' | 'done'>('selfie');
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [composite, setComposite] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buildPreview(selfieOverride?: string) {
    const pic = selfieOverride ?? selfieDataUrl;
    if (!pic) return;
    setError(null);
    try {
      const line2 = formatFeelSoLine(feelSoTags);
      const out = await compositeFramedSelfieWithText(pic, ctx.frame.fileUrl, activity, line2);
      setComposite(out);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build image');
    }
  }

  async function submit() {
    if (!composite) return;
    setSaving(true);
    setError(null);
    try {
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('decode'));
        img.src = composite;
      });
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: composite,
          frameId: ctx.frame.frameId,
          eventId: ctx.eventUuid,
          eventName: ctx.eventName,
          partnerId: FUNFITFAN_PARTNER_ID,
          partnerName: FUNFITFAN_PARTNER_NAME,
          imageWidth: img.width,
          imageHeight: img.height,
          funfitfanActivity: activity,
          funfitfanFeelSoTags: feelSoTags,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Save failed (${res.status})`);
        return;
      }
      const imageUrl = json.data?.submission?.imageUrl;
      if (typeof imageUrl === 'string' && imageUrl.trim() && onAfterSubmissionSaved) {
        try {
          await onAfterSubmissionSaved(imageUrl.trim());
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not finish workout');
          return;
        }
      }
      setStep('done');
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'selfie') {
    return (
      <div className="fff-app-fullscreen-step">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
            <CameraCapture
              initialFacingMode="user"
              frameOverlay={undefined}
              frameWidth={ctx.frame.width}
              frameHeight={ctx.frame.height}
              previewAspectWidthOverHeight={9 / 16}
              captureButtonColor="var(--fff-app-capture-accent)"
              captureButtonBorderColor="var(--fff-app-capture-accent-ring)"
              promptTitle="FunFitFan check-in"
              promptDescription="After your activity, capture your check-in photo."
              controlBar="fff-bottom-triple"
              onCancel={onCancel}
              onCapture={(_blob, dataUrl) => {
                setSelfieDataUrl(dataUrl);
                void buildPreview(dataUrl);
              }}
            />
          </div>
          {error ? (
            <div className="shrink-0 px-4 pb-2 text-center">
              <p className="fff-app-error">{error}</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (step === 'preview' && composite) {
    return (
      <div className="fff-app-fullscreen-step">
        <div className="fff-app-preview-frame">
          <div className="fff-app-preview-body fff-app-preview-body--flush-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={composite} alt="Preview" className="fff-app-preview-img" />
          </div>
          <footer className="fff-app-preview-footer">
            {error ? <p className="mb-2 text-center fff-app-error">{error}</p> : null}
            <div className="fff-app-preview-actions">
              <AppButton type="button" variant="primary" compact disabled={saving} onClick={() => void submit()}>
                {saving ? 'Saving…' : 'Save to reel'}
              </AppButton>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="py-12 fff-app-text-center">
        <p className="fff-app-success">Saved</p>
        <p className="mt-2 fff-app-muted">Your card is in your FunFitFan event and slideshow history.</p>
        <div className="app-btn-stack app-btn-stack--wizard-lg fff-app-done-stack">
          <AppButton type="button" variant="primary" onClick={() => openSlideshowInNewTab(ctx.slideshowId)}>
            Open my reel
          </AppButton>
          <AppButton type="button" variant="neutral" onClick={onCancel}>
            Home
          </AppButton>
        </div>
      </div>
    );
  }

  return null;
}
