'use client';

/**
 * Takes the photo with the device's own camera app (camera#257), for touch devices whose browser cannot take a still from
 * the live camera (every iPhone and iPad browser): a file input with `capture` opens the camera app, and the photo comes
 * back at the camera's full size (an iPhone Air front camera: 18 MP). The photo is passed on as it is; the reframe step
 * lets the guest zoom and pan anywhere in it. There is no live view inside the page for this method. The camera app opens on the front camera
 * and the user changes between all the cameras in it, so the page has one button and no front/back switch (owner, 2026-10-09: the second button is obsolete).
 */

import { useRef, useState } from 'react';
import { Button } from '@mantine/core';
import { notifyCapture } from '@/components/capture/notify';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';
import { DIAGNOSTIC_VERSION } from '@/lib/camera/diagnostics';
import { cameraTestLabel, newDiagnosticSession, pageDiagnosticFields, sendCameraDiagnostic } from '@/lib/camera/diagnostics-client';
import type { FullFrameCapture } from '@/lib/camera/frame-capture';
import { fullFrameFromBlob } from '@/lib/camera/still-capture';
import { useT } from '@/components/i18n/UiLanguageProvider';

export interface SystemCameraCaptureProps {
  onCapture: (capture: FullFrameCapture) => void;
  buttonSize?: EventButtonSize;
  promptTitle?: string;
  promptDescription?: string;
  /** Fill of the main button (hex or CSS `var(--token)`), as for the live camera's shutter. */
  captureButtonColor?: string;
}

export default function SystemCameraCapture({
  onCapture,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
  promptTitle: promptTitleProp,
  promptDescription: promptDescriptionProp,
  captureButtonColor,
}: SystemCameraCaptureProps) {
  const { t } = useT();
  const promptTitle = promptTitleProp ?? t('camera.ready.title');
  const promptDescription = promptDescriptionProp ?? t('camera.prompt.device');
  const input = useRef<HTMLInputElement>(null);
  const session = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  const receive = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const capture = await fullFrameFromBlob(file, document.createElement('canvas'), { facingMode: 'user', mirrored: false, method: 'system' });
      if (!capture) {
        notifyCapture('error', t('camera.openFailed'));
        return;
      }
      session.current ??= newDiagnosticSession();
      sendCameraDiagnostic({
        v: DIAGNOSTIC_VERSION,
        kind: 'capture',
        session: session.current,
        testRun: cameraTestLabel(),
        facingMode: 'user',
        page: pageDiagnosticFields(),
        capture: { outcome: 'ok', method: 'system', nativeWidth: capture.nativeWidth, nativeHeight: capture.nativeHeight, outputWidth: capture.width, outputHeight: capture.height },
      });
      onCapture(capture);
    } catch (error) {
      console.error('The photo from the device camera could not be used:', error);
      notifyCapture('error', t('camera.openFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    // Reset so taking the same photo again still fires a change.
    event.currentTarget.value = '';
    void receive(file);
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center" data-capture-method="system">
      <h2 className="text-xl font-semibold">{promptTitle}</h2>
      <p className="max-w-md text-sm">{promptDescription}</p>
      <input ref={input} type="file" accept="image/*" capture="user" hidden data-system-camera="user" onChange={onPick} aria-hidden="true" tabIndex={-1} />
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button type="button" size={buttonSize} radius="md" loading={busy} color={captureButtonColor} onClick={() => input.current?.click()} aria-label={t('camera.takePhoto')} data-tour-id="capture-take-photo">
          {t('camera.takePhoto')}
        </Button>
      </div>
    </div>
  );
}
