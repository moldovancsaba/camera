/**
 * Which step of the journey the capture page is on, and which consent form it shows (issue 521, phase 2; docs/JOURNEY_RECORDING.md). Pure and DOM-free: the page hands over where it is, this
 * says what to record, so the capture page itself carries no recording logic beyond one hook call. Unit-tested in steps.test.ts.
 */

import type { StepKey } from './events';

export type FlowPhase = 'onboarding' | 'presubmit' | 'capture' | 'thankyou';

export type CaptureStep = 'select-frame' | 'select-layout' | 'select-message' | 'capture-photo' | 'reframe' | 'preview';

/** The step of the funnel for a page type of the journey (the pages before the photo, and between the photo and the save). */
const PAGE_STEP: Record<string, StepKey> = {
  welcome: 'welcome',
  accept: 'consent',
  'who-are-you': 'who-are-you',
  'frame-message-selection': 'frame',
  cta: 'cta',
  restart: 'restart',
};

export interface FlowPosition {
  flowPhase: FlowPhase;
  /** The type of the custom page being shown in a pages phase, else null. */
  pageType: string | null;
  step: CaptureStep;
  /** The photo was saved (there is a submission). */
  saved: boolean;
}

/** The step of the funnel the user is on, or null for a place that is not one (a page type the funnel does not name, the share step before the save). */
export function stepKeyOf(position: FlowPosition): StepKey | null {
  if (position.flowPhase === 'thankyou') return 'thank-you';
  // A page type is a word of the editor's page list: only an own key of the table is a step (never `constructor` or `__proto__`).
  if (position.flowPhase === 'onboarding' || position.flowPhase === 'presubmit') return position.pageType && Object.prototype.hasOwnProperty.call(PAGE_STEP, position.pageType) ? PAGE_STEP[position.pageType] : null;
  switch (position.step) {
    case 'select-frame':
      return 'frame';
    case 'select-layout':
      return 'layout';
    case 'select-message':
      return 'message';
    case 'capture-photo':
      return 'camera';
    case 'reframe':
      return 'reframe';
    case 'preview':
      return position.saved ? 'saved' : null;
    default:
      return null;
  }
}

/** Which form of the consent the page shows now: its own page, or the box on the Who-are-you page; null when it shows neither. */
export function consentFormShown(position: { flowPhase: FlowPhase; pageType: string | null; acceptanceBox: boolean }): 'page' | 'box' | null {
  if (position.flowPhase !== 'onboarding' && position.flowPhase !== 'presubmit') return null;
  if (position.pageType === 'accept') return 'page';
  if (position.pageType === 'who-are-you' && position.acceptanceBox) return 'box';
  return null;
}

/** What the move from one capture step to another means for the recording: a photo taken (camera to move-and-zoom) or a retake (back). */
export function photoEventOf(from: CaptureStep | null, to: CaptureStep): 'taken' | 'retake' | null {
  if (from === 'capture-photo' && to === 'reframe') return 'taken';
  if (from === 'reframe' && to === 'capture-photo') return 'retake';
  return null;
}
