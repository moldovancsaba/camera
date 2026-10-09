import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_EVENT_TERMS_URL,
  DEFAULT_SUBMISSION_EMAIL_BODY,
  DEFAULT_SUBMISSION_EMAIL_SENDER_NAME,
  DEFAULT_SUBMISSION_EMAIL_SUBJECT,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT,
  emailDefaults,
  emailTemplateIn,
} from './submission-template-defaults';

// The English texts as they were written in this file before the language existed: they must not change by a byte.
const ENGLISH_BODY = `Hi {name},

Thank you for enjoying the {event} experience.

Your photo is ready. Don't forget to share it on your social media!
{link}

AI is fun, but it can make mistakes. If you want to make a new image, feel free to come back to us.

Wishing you an unforgettable time at {event}.

Policies and General Terms and Conditions:
{terms}`;

const ENGLISH_RESUBMISSION_BODY = `Hi {name},

Thank you for enjoying the {event} experience.

Your updated photo is ready. Don't forget to share it on your social media!
{link}

AI is fun, but it can make mistakes. If you want to make a new image, feel free to come back to us.

Wishing you an unforgettable time at {event}.

Policies and General Terms and Conditions:
{terms}`;

const ENGLISH_NOT_APPROVED_BODY = `Hi {name},

Thank you for taking part in {event}. Unfortunately your photo could not be approved, so it will not be published.

You are welcome to take another photo:
{link}

Policies and General Terms and Conditions:
{terms}`;

test('the English defaults are byte for byte the texts the emails always had', () => {
  assert.equal(DEFAULT_SUBMISSION_EMAIL_SUBJECT, 'Your photo from {event}');
  assert.equal(DEFAULT_SUBMISSION_EMAIL_BODY, ENGLISH_BODY);
  assert.equal(DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT, 'Your updated photo from {event}');
  assert.equal(DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY, ENGLISH_RESUBMISSION_BODY);
  assert.equal(DEFAULT_EVENT_TERMS_URL, 'https://seyuselfies.com/en/policies/');
  assert.equal(DEFAULT_SUBMISSION_EMAIL_SENDER_NAME, 'The Selfie');
  assert.deepEqual(emailDefaults(), emailDefaults('en'));
  assert.equal(emailDefaults('en').notApprovedSubject, 'About your photo from {event}');
  assert.equal(emailDefaults('en').notApprovedBody, ENGLISH_NOT_APPROVED_BODY);
});

test('the Hungarian defaults are Hungarian, keep every placeholder and link the Hungarian legal page', () => {
  const hu = emailDefaults('hu');
  assert.equal(hu.subject, 'A fotód – {event}');
  assert.match(hu.body, /^Szia \{name\}!\n\n/);
  assert.match(hu.notApprovedBody, /nem tudtuk jóváhagyni/);
  assert.equal(hu.termsUrl, 'https://seyuselfies.com/hu/policies/');
  for (const text of [hu.body, hu.resubmissionBody, hu.notApprovedBody]) for (const marker of ['{name}', '{event}', '{link}', '{terms}']) assert.ok(text.includes(marker), marker);
});

test('a stored template is sent as written in English; in Hungarian a stored English default is the Hungarian default of the same kind', () => {
  assert.equal(emailTemplateIn('en', ENGLISH_BODY), ENGLISH_BODY);
  assert.equal(emailTemplateIn('en', 'Your {event} photo!'), 'Your {event} photo!');
  assert.equal(emailTemplateIn('hu', DEFAULT_SUBMISSION_EMAIL_SUBJECT), emailDefaults('hu').subject);
  assert.equal(emailTemplateIn('hu', ENGLISH_BODY), emailDefaults('hu').body);
  assert.equal(emailTemplateIn('hu', ENGLISH_BODY.replace(/\n/g, '\r\n')), emailDefaults('hu').body, 'line ends saved by a browser are the same text');
  assert.equal(emailTemplateIn('hu', DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT), emailDefaults('hu').resubmissionSubject, 'the updated-photo wording stays the updated-photo wording');
  assert.equal(emailTemplateIn('hu', ENGLISH_RESUBMISSION_BODY), emailDefaults('hu').resubmissionBody);
  assert.equal(emailTemplateIn('hu', 'Szia {name}, itt a fotód: {link}'), 'Szia {name}, itt a fotód: {link}', 'an editor’s own text wins');
  assert.equal(emailTemplateIn('hu', 'Your {event} photo!'), 'Your {event} photo!', 'an English text the editor wrote is the editor’s own');
  assert.equal(emailTemplateIn('hu', null), null);
  assert.equal(emailTemplateIn('hu', ''), null);
});

test('a wording written for the partner or the event replaces the default text, the others stay', async () => {
  const { emailDefaults, emailTemplateIn } = await import('./submission-template-defaults');
  const texts = { 'email.subject': 'Szia, {name}!' };
  assert.equal(emailDefaults('en', texts).subject, 'Szia, {name}!');
  assert.equal(emailDefaults('en', texts).body, emailDefaults('en').body);
  assert.equal(emailDefaults('en', null).subject, emailDefaults('en').subject);
  // A stored English default counts as not set in Hungarian: the Hungarian wording of the level is sent instead.
  assert.equal(emailTemplateIn('hu', emailDefaults('en').subject, { 'email.subject': 'Hellő {name}' }), 'Hellő {name}');
});
