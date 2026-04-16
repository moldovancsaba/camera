'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/camera/CameraCapture';
import { AppButton } from '@/components/ui/AppButton';
import { compositeFramedSelfieWithText } from '@/components/funfitfan/composite-framed-selfie';
import { FUNFITFAN_PARTNER_ID, FUNFITFAN_PARTNER_NAME } from '@/lib/funfitfan/constants';

type BootstrapCtx = {
  eventUuid: string;
  eventName: string;
  slideshowId: string;
  partnerId: string;
  partnerName: string;
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
  const [resultText, setResultText] = useState('');
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
      setCtx({
        eventUuid: d.eventUuid,
        eventName: d.eventName,
        slideshowId: d.slideshowId,
        partnerId: d.partnerId,
        partnerName: d.partnerName,
        frame: {
          ...d.frame,
          fileUrl: overlay,
        },
      });
      setStep('selfie');
    } catch {
      setError('Network error');
      setStep('error');
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  async function buildPreview() {
    if (!selfieDataUrl || !ctx) return;
    setError(null);
    try {
      const out = await compositeFramedSelfieWithText(selfieDataUrl, ctx.frame.fileUrl, [
        activity.trim() || 'Activity',
        resultText.trim() || '',
      ]);
      setComposite(out);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build image');
    }
  }

  async function submit() {
    if (!composite || !ctx) return;
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
          funfitfanActivity: activity.trim(),
          funfitfanResult: resultText.trim(),
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
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        <p className="mt-4 text-slate-400">Preparing your FunFitFan session…</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-red-400">{error}</p>
        <div className="app-btn-stack app-btn-stack--wizard">
          <AppButton type="button" variant="primary" onClick={() => void loadBootstrap()}>
            Try again
          </AppButton>
          <AppButton type="button" variant="ghost" compact onClick={() => router.push('/fff')}>
            ← Back
          </AppButton>
        </div>
      </div>
    );
  }

  if (step === 'selfie' && ctx) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex justify-end p-3">
          <div className="pointer-events-auto">
            <AppButton type="button" variant="ghost" compact onClick={() => router.push('/fff')}>
              Cancel
            </AppButton>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-14">
          <CameraCapture
            initialFacingMode="user"
            frameOverlay={undefined}
            frameWidth={ctx.frame.width}
            frameHeight={ctx.frame.height}
            previewAspectWidthOverHeight={9 / 16}
            captureButtonColor="#10b981"
            captureButtonBorderColor="#059669"
            promptTitle="FunFitFan check-in"
            promptDescription="Tap to start the camera, then capture."
            onCapture={(_blob, dataUrl) => {
              setSelfieDataUrl(dataUrl);
              setStep('details');
            }}
            className="overflow-hidden rounded-2xl border border-white/10"
          />
        </div>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-2xl font-semibold">What did you do?</h1>
        <label className="mt-6 block text-sm text-slate-400">
          Activity
          <input
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            placeholder="e.g. Running"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm text-slate-400">
          Result
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            rows={3}
            placeholder="e.g. 5 km in 32 minutes"
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        <div className="app-btn-stack app-btn-stack--wizard-lg">
          <AppButton type="button" variant="secondary" compact onClick={() => setStep('selfie')}>
            Retake
          </AppButton>
          <AppButton type="button" variant="primary" compact onClick={() => void buildPreview()}>
            Preview card
          </AppButton>
        </div>
      </div>
    );
  }

  if (step === 'preview' && composite) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-2xl font-semibold">Your card</h1>
        <p className="mt-2 text-sm text-slate-400">Save to add it to your personal reel slideshow.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={composite} alt="Preview" className="mt-6 w-full rounded-xl border border-slate-700" />
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        <div className="app-btn-stack app-btn-stack--wizard-lg">
          <AppButton type="button" variant="secondary" compact onClick={() => setStep('details')}>
            Edit text
          </AppButton>
          <AppButton type="button" variant="primary" compact disabled={saving} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Save to reel'}
          </AppButton>
        </div>
      </div>
    );
  }

  if (step === 'done' && ctx) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-xl font-semibold text-emerald-400">Saved</p>
        <p className="mt-2 text-slate-400">Your card is in your FunFitFan event and slideshow history.</p>
        <div className="app-btn-stack app-btn-stack--wizard-lg">
          <AppButton
            type="button"
            variant="primary"
            onClick={() => router.push(`/slideshow/${ctx.slideshowId}`)}
          >
            Open my reel
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={() => router.push('/fff/log')}>
            Log another
          </AppButton>
          <AppButton type="button" variant="ghost" compact onClick={() => router.push('/fff')}>
            Home
          </AppButton>
        </div>
      </div>
    );
  }

  return null;
}
