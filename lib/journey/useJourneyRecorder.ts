'use client';

/**
 * The capture page's one hook for the journey recording (issue 521, phase 2; docs/JOURNEY_RECORDING.md). The page hands over where the user is; the hook records the steps, the consent and the
 * photo moves from that, and starts nothing unless the event answer said the recording is on. It only **reads** the page's state and calls `journey` (lib/journey/client.ts), which never
 * throws and never waits, so the hook cannot change what the page does. The few things that are not a change of place (the save result, a share button, the camera permission) are
 * recorded by one line at the place they happen.
 *
 * Nothing is recorded on a return from a sign-in that was already recorded before the sign-in: the return is `journey.resume` (not a visit), and the consent shown and accepted are not
 * recorded again, because the page restores the accepted consent from the session on the way back.
 */

import { useEffect, useRef } from 'react';
import { journey } from './client';
import { consentFormShown, photoEventOf, stepKeyOf, type CaptureStep, type FlowPhase } from './steps';

export interface JourneyFlow {
  /** The event is loaded and its answer said `journeyRecording: true`. */
  enabled: boolean;
  /** The event as the page's address names it. */
  eventId: string;
  flowPhase: FlowPhase;
  pageType: string | null;
  step: CaptureStep;
  /** The Who-are-you page shows the acceptance box (issue 523). */
  acceptanceBox: boolean;
  /** At least one consent of an accept page or the box was accepted. */
  consentGiven: boolean;
  captureMethod: 'system' | 'still' | 'frame' | null;
  saved: boolean;
}

export function useJourneyRecorder(flow: JourneyFlow): void {
  const resumed = useRef(false);
  const previousStep = useRef<CaptureStep | null>(null);

  useEffect(() => {
    try {
      resumed.current = new URLSearchParams(window.location.search).get('resume') === 'true';
    } catch {
      resumed.current = false;
    }
  }, []);

  // Starts the visit, and sends what is left when the page is hidden or closed.
  useEffect(() => {
    if (!flow.enabled) return;
    journey.start({ eventId: flow.eventId, resumed: resumed.current });
    const onHide = () => {
      try {
        if (document.visibilityState === 'hidden') journey.flushNow();
      } catch {
        // never affects the page
      }
    };
    const onLeave = () => journey.flushNow();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      journey.flushNow();
    };
  }, [flow.enabled, flow.eventId]);

  const key = stepKeyOf({ flowPhase: flow.flowPhase, pageType: flow.pageType, step: flow.step, saved: flow.saved });
  useEffect(() => {
    if (flow.enabled && key) journey.once('step.reach', key);
  }, [flow.enabled, key]);

  const shown = consentFormShown({ flowPhase: flow.flowPhase, pageType: flow.pageType, acceptanceBox: flow.acceptanceBox });
  useEffect(() => {
    if (flow.enabled && shown && !resumed.current) journey.once('consent.shown', shown);
  }, [flow.enabled, shown]);

  useEffect(() => {
    if (flow.enabled && flow.consentGiven && !resumed.current) journey.once('consent.accept', flow.acceptanceBox ? 'box' : 'page');
  }, [flow.enabled, flow.consentGiven, flow.acceptanceBox]);

  useEffect(() => {
    const from = previousStep.current;
    previousStep.current = flow.step;
    if (!flow.enabled || flow.flowPhase !== 'capture') return;
    const moved = photoEventOf(from, flow.step);
    if (moved === 'taken' && flow.captureMethod) journey.record('photo.taken', flow.captureMethod);
    else if (moved === 'retake') journey.record('photo.retake');
  }, [flow.enabled, flow.step, flow.flowPhase, flow.captureMethod]);
}
