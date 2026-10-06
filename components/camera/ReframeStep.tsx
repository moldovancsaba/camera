/**
 * Reframe step (camera#209): after the whole camera image is recorded, the fan sees it under the
 * frame, moves and zooms it, or shows everything, then continues. The default is the largest
 * crop that fills the frame, centred, which is what the old capture produced.
 *
 * The same renderer (lib/camera/reframe-render.ts) draws the preview and the final crop, so the
 * result is what was on screen. The geometry is pure and unit-tested (lib/camera/reframe.ts).
 *
 * Controls: drag to move, pinch or wheel to zoom, arrow keys to move, plus and minus to zoom, a
 * GDS slider and mode control, Reset, Retake and Continue.
 */

'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@mantine/core';
import { GdsSegmentedControl, GdsSlider } from '@sovereignsquad/gds-core/client';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';
import { capCanvasSize } from '@/lib/camera/constraints';
import { blobToDataUrl, type FullFrameCapture } from '@/lib/camera/frame-capture';
import {
  MAX_ZOOM,
  canShowEverything as canShowEverythingFor,
  clampView,
  defaultView,
  fitView,
  minZoom,
  modeOf,
  panView,
  toReframeRecord,
  viewBoxOf,
  zoomView,
  type ReframeMode,
  type ReframeRecord,
  type ReframeView,
} from '@/lib/camera/reframe';
import { renderReframe } from '@/lib/camera/reframe-render';

/** The frame-less crop (what the composite step and try-on use) and how it was made. */
export interface ReframeResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  record: ReframeRecord;
}

export interface ReframeStepProps {
  capture: FullFrameCapture;
  /** Width over height of the frame the photo is cropped to. */
  frameAspect: number;
  /** The frame overlay, drawn over the preview exactly as in the final composite. */
  frameImageUrl?: string | null;
  buttonSize?: EventButtonSize;
  onDone: (result: ReframeResult) => void;
  onRetake: () => void;
  labels?: { continue?: string; retake?: string; reset?: string };
}

interface Source {
  image: CanvasImageSource;
  width: number;
  height: number;
}

const KEY_STEP = 0.04;
const KEY_ZOOM_FACTOR = 1.1;

function loadHtmlImage(url: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = crossOrigin;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load the image'));
    image.src = url;
  });
}

export default function ReframeStep({
  capture,
  frameAspect,
  frameImageUrl,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
  onDone,
  onRetake,
  labels,
}: ReframeStepProps) {
  const [source, setSource] = useState<Source | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [frameImage, setFrameImage] = useState<HTMLImageElement | null>(null);
  const [viewState, setViewState] = useState<ReframeView | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [isFinishing, setIsFinishing] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const instructionsId = useId();

  const initialView = useMemo(() => (source ? defaultView(source.width, source.height) : null), [source]);
  const view = viewState ?? initialView;
  // Handlers read the latest view from a ref, which is updated after render (not during it).
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Decode the original off the main thread when the browser can.
  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    let objectUrl: string | null = null;

    (async () => {
      try {
        if (typeof createImageBitmap === 'function') {
          bitmap = await createImageBitmap(capture.blob);
          if (cancelled) {
            bitmap.close();
            bitmap = null;
            return;
          }
          setSource({ image: bitmap, width: bitmap.width, height: bitmap.height });
        } else {
          objectUrl = URL.createObjectURL(capture.blob);
          const image = await loadHtmlImage(objectUrl);
          if (!cancelled) setSource({ image, width: image.naturalWidth, height: image.naturalHeight });
        }
      } catch (error) {
        console.error('Failed to decode the captured photo:', error);
        if (!cancelled) setLoadFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      bitmap?.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [capture.blob]);

  // The frame overlay is optional; without it the preview simply has no overlay.
  useEffect(() => {
    if (!frameImageUrl) return;
    let cancelled = false;
    loadHtmlImage(frameImageUrl, 'anonymous').then(
      (image) => {
        if (!cancelled) setFrameImage(image);
      },
      (error) => console.error('Failed to load the frame overlay:', error)
    );
    return () => {
      cancelled = true;
      setFrameImage(null);
    };
  }, [frameImageUrl]);

  // The stage has the frame's shape and fills the free space.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => {
      const style = window.getComputedStyle(wrapper);
      const availableWidth = wrapper.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      const availableHeight = wrapper.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
      if (availableWidth <= 0 || availableHeight <= 0) return;
      const width = Math.min(availableWidth, availableHeight * frameAspect);
      setStage({ width: Math.floor(width), height: Math.floor(width / frameAspect) });
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(wrapper);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [frameAspect]);

  // Draw the preview whenever the view, the image or the frame changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!source || !view || !canvas || stage.width <= 0) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(stage.width * ratio));
    const height = Math.max(1, Math.round(width / frameAspect));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    renderReframe(canvas, source.image, source.width, source.height, viewBoxOf(view, source.width, source.height, frameAspect), {
      mirrored: capture.mirrored,
      frame: frameImage,
    });
  }, [source, view, stage.width, frameAspect, frameImage, capture.mirrored]);

  const update = useCallback((next: ReframeView) => setViewState(next), []);

  /** A point of the stage, in CSS pixels, as a point of the source image. */
  const toSourcePoint = useCallback(
    (clientX: number, clientY: number) => {
      const stageEl = stageRef.current;
      const current = viewRef.current;
      if (!stageEl || !source || !current) return null;
      const rect = stageEl.getBoundingClientRect();
      const box = viewBoxOf(current, source.width, source.height, frameAspect);
      const ux = (clientX - rect.left) / rect.width;
      const uy = (clientY - rect.top) / rect.height;
      return { x: box.x + (capture.mirrored ? 1 - ux : ux) * box.width, y: box.y + uy * box.height };
    },
    [source, frameAspect, capture.mirrored]
  );

  /** Moves the image by `dxPx`, `dyPx` stage pixels, like a finger dragging it. */
  const dragBy = useCallback(
    (dxPx: number, dyPx: number) => {
      const current = viewRef.current;
      const stageEl = stageRef.current;
      if (!current || !source || !stageEl) return;
      const rect = stageEl.getBoundingClientRect();
      const box = viewBoxOf(current, source.width, source.height, frameAspect);
      const dx = (capture.mirrored ? 1 : -1) * dxPx * (box.width / rect.width);
      const dy = -dyPx * (box.height / rect.height);
      update(panView(current, dx, dy, source.width, source.height, frameAspect));
    },
    [source, frameAspect, capture.mirrored, update]
  );

  const zoomTo = useCallback(
    (zoom: number, clientX?: number, clientY?: number) => {
      const current = viewRef.current;
      if (!current || !source) return;
      let anchor = clientX !== undefined && clientY !== undefined ? toSourcePoint(clientX, clientY) : null;
      if (!anchor) {
        const box = viewBoxOf(current, source.width, source.height, frameAspect);
        anchor = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      update(zoomView(current, zoom, anchor, source.width, source.height, frameAspect));
    },
    [source, frameAspect, toSourcePoint, update]
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && viewRef.current) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: viewRef.current.zoom };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      dragBy(event.clientX - previous.x, event.clientY - previous.y);
    } else if (pointers.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomTo(pinchRef.current.zoom * (distance / pinchRef.current.distance), (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    pinchRef.current = null;
  };

  // The wheel listener is native because React's is passive and could not stop the page scrolling.
  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;
    const onWheel = (event: WheelEvent) => {
      const current = viewRef.current;
      if (!current) return;
      event.preventDefault();
      zoomTo(current.zoom * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };
    stageEl.addEventListener('wheel', onWheel, { passive: false });
    return () => stageEl.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = viewRef.current;
    if (!current) return;
    const step = Math.max(8, stage.width * KEY_STEP);

    switch (event.key) {
      case 'ArrowLeft':
        dragBy(-step, 0);
        break;
      case 'ArrowRight':
        dragBy(step, 0);
        break;
      case 'ArrowUp':
        dragBy(0, -step);
        break;
      case 'ArrowDown':
        dragBy(0, step);
        break;
      case '+':
      case '=':
        zoomTo(current.zoom * KEY_ZOOM_FACTOR);
        break;
      case '-':
      case '_':
        zoomTo(current.zoom / KEY_ZOOM_FACTOR);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const finish = async () => {
    const current = viewRef.current;
    if (!source || !current || isFinishing) return;
    setIsFinishing(true);
    try {
      const box = viewBoxOf(current, source.width, source.height, frameAspect);
      const size = capCanvasSize(box.width, box.height);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      if (!renderReframe(canvas, source.image, source.width, source.height, box, { mirrored: capture.mirrored })) {
        throw new Error('Canvas not supported');
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (!blob) throw new Error('Failed to encode the cropped image');
      onDone({
        blob,
        dataUrl: await blobToDataUrl(blob),
        width: size.width,
        height: size.height,
        record: toReframeRecord(current, source.width, source.height, frameAspect, capture.mirrored),
      });
    } catch (error) {
      console.error('Error applying the crop:', error);
      setIsFinishing(false);
    }
  };

  const low = source ? minZoom(source.width, source.height, frameAspect) : 1;
  const canShowEverything = source ? canShowEverythingFor(source.width, source.height, frameAspect) : false;
  const mode: ReframeMode = source && view ? modeOf(view, source.width, source.height, frameAspect) : 'fill';
  const zoomPercent = view ? Math.round(clampView(view, source?.width ?? 1, source?.height ?? 1, frameAspect).zoom * 100) : 100;
  const modeLabel = mode === 'fill' ? 'Filling the frame' : mode === 'fit' ? 'Showing everything' : 'Custom position';

  if (loadFailed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
        <p>We could not open the photo. Please retake it.</p>
        <Button type="button" size={buttonSize} radius="md" onClick={onRetake}>
          {labels?.retake ?? 'Retake'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={wrapperRef} className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div
          ref={stageRef}
          role="group"
          tabIndex={0}
          aria-label="Photo position inside the frame"
          aria-describedby={instructionsId}
          className="relative overflow-hidden"
          style={{ width: stage.width || undefined, height: stage.height || undefined, touchAction: 'none', cursor: 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
        <p className="text-center text-xs" role="status" aria-live="polite">
          {`Zoom ${zoomPercent}%. ${modeLabel}.`}
        </p>

        <GdsSegmentedControl<ReframeMode>
          ariaLabel="How the photo fits the frame"
          fullWidth
          value={mode}
          onChange={(next) => {
            if (!source) return;
            if (next === 'fill') update(defaultView(source.width, source.height));
            if (next === 'fit') update(fitView(source.width, source.height, frameAspect));
          }}
          options={[
            { value: 'fill', label: 'Fill frame' },
            { value: 'fit', label: 'Show everything', disabled: !canShowEverything },
            { value: 'custom', label: 'Custom', disabled: true },
          ]}
        />

        <GdsSlider
          label="Zoom"
          ariaLabel="Zoom"
          min={Math.round(low * 100)}
          max={MAX_ZOOM * 100}
          step={1}
          value={zoomPercent}
          onChange={(value) => zoomTo(value / 100)}
          disabled={!source}
        />

        <p id={instructionsId} className="text-center text-xs">
          Drag the photo to move it, pinch or use the zoom control to resize it. With the keyboard, use the arrow keys to move
          and plus and minus to zoom.
        </p>

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="light" size={buttonSize} radius="md" onClick={onRetake} disabled={isFinishing}>
            {labels?.retake ?? 'Retake'}
          </Button>
          <Button
            type="button"
            variant="light"
            size={buttonSize}
            radius="md"
            onClick={() => source && update(defaultView(source.width, source.height))}
            disabled={!source || isFinishing}
          >
            {labels?.reset ?? 'Reset'}
          </Button>
          <Button type="button" size={buttonSize} radius="md" onClick={() => void finish()} disabled={!source || isFinishing} loading={isFinishing}>
            {labels?.continue ?? 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
