'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/camera/CameraCapture';
import { AppButton } from '@/components/ui/AppButton';
import { compositeFramedSelfieWithText } from '@/components/funfitfan/composite-framed-selfie';
import FeelSoHashtagInput from '@/components/funfitfan/FeelSoHashtagInput';
import { FUNFITFAN_PARTNER_ID, FUNFITFAN_PARTNER_NAME } from '@/lib/funfitfan/constants';
import { formatFeelSoLine } from '@/lib/funfitfan/feel-so-tags';
import { openSlideshowInNewTab } from '@/lib/slideshow/open-slideshow';

type BootstrapCtx = {
  eventUuid: string;
  eventName: string;
  slideshowId: string;
  partnerId: string;
  partnerName: string;
  sportActivities: string[];
  frame: {
    frameId: string;
    name: string;
    fileUrl: string;
    imageUrl?: string;
    width: number;
    height: number;
  };
};

export default function FunFitFanLogWizard() {
  const router = useRouter();
  const [step, setStep] = useState<'load' | 'selfie' | 'details' | 'preview' | 'done' | 'error'>('load');
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<BootstrapCtx | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [activity, setActivity] = useState('');
  const [feelSoTags, setFeelSoTags] = useState<string[]>([]);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);
  const [composite, setComposite] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadBootstrap = useCallback(async () => {
    setStep('load');
    setError(null);
    try {
      const res = await fetch('/api/fff/bootstrap');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Could not start (${res.status})`);
        setStep('error');
        return;
      }
      const d = json.data;
      const overlay =
        d?.frame?.fileUrl ||
        (typeof d?.frame?.imageUrl === 'string' ? d.frame.imageUrl : '');
      if (!d?.frame?.frameId || !overlay) {
        setError(json.error || 'Could not load your FunFitFan frame. Ask an admin to set the default frame.');
        setStep('error');
        return;
      }
      const sportActivities = Array.isArray(d?.sportActivities)
        ? (d.sportActivities as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [];
      setCtx({
        eventUuid: d.eventUuid,
        eventName: d.eventName,
        slideshowId: d.slideshowId,
        partnerId: d.partnerId,
        partnerName: d.partnerName,
        sportActivities,
        frame: {
          ...d.frame,
          fileUrl: overlay,
        },
      });
      setStep('details');
    } catch {
      setError('Network error');
      setStep('error');
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (step !== 'details') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/fff/hashtags');
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const list = json.data?.hashtags;
        if (Array.isArray(list)) {
          setHashtagSuggestions(list.filter((x: unknown): x is string => typeof x === 'string'));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  function goToSelfieStep() {
    if (!ctx) return;
    const act = activity.trim();
    if (!act || !ctx.sportActivities.includes(act)) {
      setError('Choose a sport activity from the list.');
      return;
    }
    setError(null);
    setStep('selfie');
  }

  /** Pass `selfieOverride` right after capture so preview does not rely on async `setSelfieDataUrl`. */
  async function buildPreview(selfieOverride?: string) {
    const pic = selfieOverride ?? selfieDataUrl;
    if (!pic || !ctx) return;
    const act = activity.trim();
    if (!act || !ctx.sportActivities.includes(act)) {
      setError('Choose a sport activity from the list.');
      return;
    }
    setError(null);
    try {
      const line2 = formatFeelSoLine(feelSoTags);
      const out = await compositeFramedSelfieWithText(pic, ctx.frame.fileUrl, act, line2);
      setComposite(out);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build image');
    }
  }

  async function submit() {
    if (!composite || !ctx) return;
    const act = activity.trim();
    if (!act || !ctx.sportActivities.includes(act)) {
      setError('Choose a sport activity from the list.');
      return;
    }
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
          funfitfanActivity: act,
          funfitfanFeelSoTags: feelSoTags,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Save failed (${res.status})`);
        return;
      }
      setStep('done');
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'load') {
    return (
      <div className="fff-app-center-block">
        <div className="fff-app-spinner" aria-hidden />
        <p className="mt-4 fff-app-muted">Preparing your FunFitFan session…</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="py-12 text-center">
        <p className="fff-app-error">{error}</p>
        <div className="app-btn-stack app-btn-stack--wizard">
          <AppButton type="button" variant="primary" onClick={() => void loadBootstrap()}>
            Try again
          </AppButton>
          <AppButton type="button" variant="ghost" compact onClick={() => router.push('/fff')}>
            Back
          </AppButton>
        </div>
      </div>
    );
  }

  if (step === 'details' && ctx) {
    return (
      <div className="py-8">
        <h1 className="fff-app-page-title">What did you do?</h1>
        <label className="fff-field-label" htmlFor="fff-activity">
          Activity
        </label>
        <select
          id="fff-activity"
          className="fff-field-select"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
        >
          <option value="">— Choose an activity —</option>
          {ctx.sportActivities.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <label className="fff-field-label" htmlFor="fff-feelso-input">
          Feel so
        </label>
        <FeelSoHashtagInput
          id="fff-feelso-input"
          value={feelSoTags}
          onChange={setFeelSoTags}
          suggestions={hashtagSuggestions}
        />
        {error ? <p className="mt-3 fff-app-error">{error}</p> : null}
        <div className="app-btn-stack app-btn-stack--wizard-lg">
          {selfieDataUrl ? (
            <>
              <AppButton
                type="button"
                variant="secondary"
                compact
                onClick={() => {
                  setError(null);
                  setStep('selfie');
                }}
              >
                Retake selfie
              </AppButton>
              <AppButton type="button" variant="primary" compact onClick={() => void buildPreview()}>
                Preview card
              </AppButton>
            </>
          ) : (
            <>
              <AppButton type="button" variant="ghost" compact onClick={() => router.push('/fff')}>
                Cancel
              </AppButton>
              <AppButton type="button" variant="primary" compact onClick={() => goToSelfieStep()}>
                Take selfie
              </AppButton>
            </>
          )}
        </div>
      </div>
    );
  }

  if (step === 'selfie' && ctx) {
    return (
      <div className="fff-app-fullscreen-step">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 pt-4 pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]">
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
              tripleBarExtra={
                <AppButton
                  type="button"
                  variant="secondary"
                  compact
                  onClick={() => {
                    setError(null);
                    setStep('details');
                  }}
                >
                  Edit activity
                </AppButton>
              }
              onCancel={() => router.push('/fff')}
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
              <AppButton type="button" variant="secondary" compact onClick={() => setStep('details')}>
                Edit text
              </AppButton>
              <AppButton type="button" variant="primary" compact disabled={saving} onClick={() => void submit()}>
                {saving ? 'Saving…' : 'Save to reel'}
              </AppButton>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  if (step === 'done' && ctx) {
    return (
      <div className="py-12 fff-app-text-center">
        <p className="fff-app-success">Saved</p>
        <p className="mt-2 fff-app-muted">Your card is in your FunFitFan event and slideshow history.</p>
        <div className="app-btn-stack app-btn-stack--wizard-lg fff-app-done-stack">
          <AppButton
            type="button"
            variant="primary"
            onClick={() => openSlideshowInNewTab(ctx.slideshowId)}
          >
            Open my reel
          </AppButton>
          <AppButton type="button" variant="neutral" onClick={() => router.push('/fff')}>
            Home
          </AppButton>
        </div>
      </div>
    );
  }

  return null;
}
