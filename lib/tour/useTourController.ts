'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGdsTelemetry, useOverlayManager } from '@sovereignsquad/gds-core/client';
import type { TourStepConfig } from './types';
import { hasTourBeenSeen, markTourSeen } from './storage';

export interface TourController {
  isOpen: boolean;
  isTopMost: boolean;
  currentStep: TourStepConfig | null;
  currentIndex: number;
  totalSteps: number;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
}

/**
 * Step-sequencing state for a guided tour. Registers with the app's
 * existing OverlayManagerProvider (components/gds/CameraGdsProvider.tsx)
 * so this coordinates with confirm dialogs / toasts / other overlays
 * instead of running an independent overlay stack.
 */
export function useTourController(
  tourId: string,
  steps: TourStepConfig[],
  options?: { autoStart?: boolean }
): TourController {
  const availableSteps = useMemo(
    () => steps.filter((step) => step.isAvailable?.() ?? true),
    [steps]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const overlayManager = useOverlayManager();
  const telemetry = useGdsTelemetry();
  const autoStartedRef = useRef(false);
  const correlationIdRef = useRef<string | null>(null);

  const emit = useCallback(
    (eventType: string, payload?: Record<string, string | number | boolean | null>) => {
      if (!correlationIdRef.current) return;
      telemetry.emit({
        component: 'GuidedTour',
        eventType,
        correlationId: correlationIdRef.current,
        payload: { tourId, ...payload },
      });
    },
    [telemetry, tourId]
  );

  const finish = useCallback(
    (status: 'completed' | 'skipped') => {
      setIsOpen(false);
      overlayManager.closeOverlay(tourId, status === 'completed' ? 'action' : 'programmatic');
      overlayManager.unregisterOverlay(tourId);
      markTourSeen(tourId, status);
      emit(status === 'completed' ? 'tour_completed' : 'tour_skipped');
      correlationIdRef.current = null;
    },
    [emit, overlayManager, tourId]
  );

  const start = useCallback(() => {
    if (availableSteps.length === 0) return;
    correlationIdRef.current = `${tourId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    setCurrentIndex(0);
    setIsOpen(true);
    overlayManager.registerOverlay({
      id: tourId,
      kind: 'popover',
      policy: { closeOnEscape: true, closeOnOutsideClick: false, returnFocus: true },
    });
    overlayManager.openOverlay({ id: tourId, kind: 'popover' });
    emit('tour_started', { totalSteps: availableSteps.length });
  }, [availableSteps.length, emit, overlayManager, tourId]);

  // Auto-start once per browser, after the surrounding UI has painted so the
  // first step's target actually exists to measure.
  useEffect(() => {
    if (!options?.autoStart || autoStartedRef.current) return;
    if (availableSteps.length === 0) return;
    if (hasTourBeenSeen(tourId)) return;
    autoStartedRef.current = true;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => start());
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.autoStart, tourId, availableSteps.length]);

  // Reads currentIndex from the closure rather than a setCurrentIndex functional
  // updater -- React can invoke an updater during another component's render,
  // and finish() below has side effects (closes/unregisters a *different*
  // component's overlay state), which isn't safe to do from inside one.
  const next = useCallback(() => {
    if (currentIndex + 1 >= availableSteps.length) {
      finish('completed');
      return;
    }
    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    emit('tour_step_viewed', { stepIndex: nextIndex, stepId: availableSteps[nextIndex]?.id ?? null });
  }, [currentIndex, availableSteps, emit, finish]);

  const back = useCallback(() => {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }, []);

  const skip = useCallback(() => {
    finish('skipped');
  }, [finish]);

  // Always safe to unregister on unmount even if never opened -- the
  // manager treats an unknown id as a no-op.
  useEffect(() => {
    return () => {
      overlayManager.unregisterOverlay(tourId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId]);

  return {
    isOpen,
    isTopMost: isOpen && overlayManager.isTopMost(tourId),
    currentStep: isOpen ? availableSteps[currentIndex] ?? null : null,
    currentIndex,
    totalSteps: availableSteps.length,
    start,
    next,
    back,
    skip,
  };
}
