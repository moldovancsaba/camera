'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import CameraCapture from '@/components/camera/CameraCapture';

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
      setMessage('Saved. Redirecting…');
      router.push(`/gym/session/${sessionId}`);
      router.refresh();
    } catch {
      setMessage('Network error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {uploading ? (
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Uploading…</p>
      ) : null}
      {message ? <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">{message}</p> : null}
      <CameraCapture
        initialFacingMode="user"
        promptTitle="Take your gym selfie"
        promptDescription="Front camera by default; you can flip if your device supports it."
        onCapture={onCapture}
        className="rounded-xl border border-slate-200 dark:border-gray-700"
        frameOverlay={guideFrame?.frameOverlay}
        frameWidth={guideFrame?.frameWidth}
        frameHeight={guideFrame?.frameHeight}
      />
    </div>
  );
}
