import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consentFormShown, photoEventOf, stepKeyOf, type CaptureStep, type FlowPhase } from './steps';
import { STEP_KEYS } from './events';

const at = (flowPhase: FlowPhase, pageType: string | null, step: CaptureStep = 'select-frame', saved = false) => stepKeyOf({ flowPhase, pageType, step, saved });

test('the pages before the photo are the steps of the funnel by their type', () => {
  assert.equal(at('onboarding', 'welcome'), 'welcome');
  assert.equal(at('onboarding', 'accept'), 'consent');
  assert.equal(at('onboarding', 'who-are-you'), 'who-are-you');
  assert.equal(at('onboarding', 'cta'), 'cta');
  assert.equal(at('onboarding', 'restart'), 'restart');
  assert.equal(at('presubmit', 'who-are-you'), 'who-are-you', 'the Who-are-you page between the photo and the save is the same step');
  assert.equal(at('onboarding', 'take-photo'), null);
  assert.equal(at('onboarding', null), null);
  for (const odd of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '']) assert.equal(at('onboarding', odd), null, odd);
});

test('the capture steps map to the funnel, and the preview is "saved" only once the photo is saved', () => {
  assert.equal(at('capture', null, 'select-frame'), 'frame');
  assert.equal(at('capture', null, 'select-layout'), 'layout');
  assert.equal(at('capture', null, 'select-message'), 'message');
  assert.equal(at('capture', null, 'capture-photo'), 'camera');
  assert.equal(at('capture', null, 'reframe'), 'reframe');
  assert.equal(at('capture', null, 'preview', false), null);
  assert.equal(at('capture', null, 'preview', true), 'saved');
  assert.equal(at('thankyou', 'cta', 'preview', true), 'thank-you');
});

test('every step the funnel names can be reached by some position of the page', () => {
  const reached = new Set<string | null>([
    at('onboarding', 'welcome'), at('onboarding', 'accept'), at('onboarding', 'who-are-you'), at('onboarding', 'cta'), at('onboarding', 'restart'),
    at('capture', null, 'select-frame'), at('capture', null, 'select-layout'), at('capture', null, 'select-message'), at('capture', null, 'capture-photo'), at('capture', null, 'reframe'), at('capture', null, 'preview', true), at('thankyou', 'restart'),
  ]);
  for (const key of STEP_KEYS) assert.ok(reached.has(key), key);
});

test('the consent is shown on its own page, or as the box on the Who-are-you page; nowhere else', () => {
  assert.equal(consentFormShown({ flowPhase: 'onboarding', pageType: 'accept', acceptanceBox: false }), 'page');
  assert.equal(consentFormShown({ flowPhase: 'onboarding', pageType: 'who-are-you', acceptanceBox: true }), 'box');
  assert.equal(consentFormShown({ flowPhase: 'presubmit', pageType: 'who-are-you', acceptanceBox: true }), 'box');
  assert.equal(consentFormShown({ flowPhase: 'onboarding', pageType: 'who-are-you', acceptanceBox: false }), null);
  assert.equal(consentFormShown({ flowPhase: 'capture', pageType: 'accept', acceptanceBox: false }), null);
  assert.equal(consentFormShown({ flowPhase: 'thankyou', pageType: 'accept', acceptanceBox: false }), null);
});

test('a photo is taken when the camera hands over to the move-and-zoom step, and retaken when it goes back', () => {
  assert.equal(photoEventOf('capture-photo', 'reframe'), 'taken');
  assert.equal(photoEventOf('reframe', 'capture-photo'), 'retake');
  assert.equal(photoEventOf('reframe', 'preview'), null);
  assert.equal(photoEventOf('preview', 'capture-photo'), null);
  assert.equal(photoEventOf(null, 'capture-photo'), null);
  assert.equal(photoEventOf('select-frame', 'capture-photo'), null);
});
