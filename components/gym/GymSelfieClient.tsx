'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import CameraCapture from '@/components/camera/CameraCapture';
import { AppButton } from '@/components/ui/AppButton';

export default function GymSelfieClient({
  sessionId,
  guideFrame,
}: {
  sessionId: string;
  guideFrame: { frameOverlay: string; frameWidth?: number; frameHeight?: number } | null;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fw =
    guideFrame?.frameWidth && guideFrame.frameWidth > 0 ? guideFrame.frameWidth : 1080;
  const fh =
    guideFrame?.frameHeight && guideFrame.frameHeight > 0 ? guideFrame.frameHeight : 1920;

  async function onCapture(_blob: Blob, dataUrl: string) {
    setUploading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/gym/sessions/${sessionId}/selfie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || `Upload failed (${res.status})`);
        return;
      }

      const completeRes = await fetch(`/api/gym/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) {
        setMessage(
          typeof completeData.error === 'string'
            ? completeData.error
            : `Photo saved, but the workout could not be marked complete (${completeRes.status}). Open your session from Gym to finish.`
        );
        return;
      }

      router.push('/gym');
      router.refresh();
    } catch {
      setMessage('Network error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fff-app-fullscreen-step">
      <div className="flex min-h-0 flex-1 flex-col">
        {uploading ? (
          <div className="shrink-0 px-4 pt-3 text-center">
            <p className="text-sm fff-app-muted">Saving workout…</p>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pt-4 pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]">
          <CameraCapture
            initialFacingMode="user"
            frameOverlay={undefined}
            frameWidth={fw}
            frameHeight={fh}
            previewAspectWidthOverHeight={9 / 16}
            captureButtonColor="var(--fff-app-capture-accent)"
            captureButtonBorderColor="var(--fff-app-capture-accent-ring)"
            promptTitle="FunFitFan check-in"
            promptDescription="After your activity, capture your check-in photo."
            controlBar="fff-bottom-triple"
            tripleBarExtra={
              <AppButton type="button" variant="secondary" compact onClick={() => router.push('/gym')}>
                Back to gym
              </AppButton>
            }
            onCancel={() => router.push('/gym')}
            onCapture={(_blob, dataUrl) => void onCapture(_blob, dataUrl)}
          />
        </div>
        {message ? (
          <div className="shrink-0 px-4 pb-2 text-center">
            <p className="text-sm fff-app-error">{message}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
