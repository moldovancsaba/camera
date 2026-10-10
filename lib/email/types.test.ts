import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BODY_MAX, EMAIL_TYPES, EMAIL_TYPE_INFO, SUBJECT_MAX, parseTypeSettings, partnerSwitchDefaults, switchIsOn, typeDefaults } from './types';
import { normalizeSubmissionEmailPolicy } from './submission-result-email';
import { mergeNotificationSettings, sanitizeNotificationSettings } from './notification-settings';

test('there are five e-mail types, with the owner’s defaults: welcome, arrived and follow up off, approved and declined on', () => {
  assert.deepEqual([...EMAIL_TYPES], ['welcome', 'arrived', 'approved', 'declined', 'followUp']);
  assert.deepEqual(EMAIL_TYPES.map((type) => EMAIL_TYPE_INFO[type].defaultOn), [false, false, true, true, false]);
});

test('every type has a default subject and message in both languages, with the standard terms line; the e-mail that has a button has its label', () => {
  for (const type of EMAIL_TYPES) {
    for (const language of ['en', 'hu'] as const) {
      const defaults = typeDefaults(type, language);
      assert.ok(defaults.subject.length > 3 && defaults.body.length > 20, `${type} ${language}`);
      assert.ok(defaults.body.includes('{terms}'), `${type} ${language}: the standard terms line`);
      assert.equal(Boolean(defaults.button), EMAIL_TYPE_INFO[type].buttonKey !== null);
    }
  }
  assert.ok(typeDefaults('welcome', 'hu').body.includes('{eventlink}') && typeDefaults('followUp', 'hu').body.includes('{date}'));
  assert.equal(typeDefaults('arrived', 'en').button, null, 'arrived has no link to give');
  assert.equal(typeDefaults('declined', 'en', { 'email.buttonAnother': 'One more' }).button, 'One more', 'a wording written for the event is used');
});

test('what is stored for the types is checked: a switch is a boolean, a subject and a message are text within their limits, anything else is not a choice', () => {
  assert.deepEqual(parseTypeSettings({ welcome: { enabled: true }, approved: { subject: '  Hi  ', body: 'a\r\nb', enabled: false }, nope: { enabled: true }, declined: { enabled: 'yes', subject: 5 } }), {
    welcome: { enabled: true },
    approved: { subject: 'Hi', body: 'a\nb', enabled: false },
  });
  const long = parseTypeSettings({ followUp: { subject: 'x'.repeat(SUBJECT_MAX + 50), body: 'y'.repeat(BODY_MAX + 50) } });
  assert.equal(long.followUp?.subject?.length, SUBJECT_MAX);
  assert.equal(long.followUp?.body?.length, BODY_MAX);
  for (const bad of [null, undefined, 'x', [], 7, { welcome: 'on' }, { welcome: {} }, { approved: { subject: '   ' } }]) assert.deepEqual(parseTypeSettings(bad), {}, JSON.stringify(bad));
});

test('the settings a request sets are only what the editor chose: valid fields, nothing filled in with a default', () => {
  assert.deepEqual(sanitizeNotificationSettings(undefined), {});
  assert.deepEqual(sanitizeNotificationSettings({}), {});
  assert.deepEqual(
    sanitizeNotificationSettings({
      submissionResultEmailEnabled: true,
      submissionResultEmailSendAfterSave: false,
      submissionResultEmailSubjectAfterSave: ' Hi ',
      submissionResultEmailBodyAfterSave: 'a\r\nb',
      submissionResultEmailSenderName: ' MTK ',
      termsUrl: 'https://seyuselfies.com/hu/policies/',
      types: { welcome: { enabled: true } },
      unknownField: 'x',
      submissionResultEmailBody: '   ',
    }),
    {
      submissionResultEmailEnabled: true,
      submissionResultEmailSendAfterSave: false,
      submissionResultEmailSubjectAfterSave: 'Hi',
      submissionResultEmailBodyAfterSave: 'a\nb',
      submissionResultEmailSenderName: 'MTK',
      termsUrl: 'https://seyuselfies.com/hu/policies/',
      types: { welcome: { enabled: true } },
    }
  );
  for (const bad of ['javascript:alert(1)', 'not a url', 7, ['https://a.test'], 'ftp://a.test']) assert.equal('termsUrl' in sanitizeNotificationSettings({ termsUrl: bad }), false, String(bad));
  assert.equal('submissionResultEmailEnabled' in sanitizeNotificationSettings({ submissionResultEmailEnabled: 'true' }), false);
});

test('saving from the Emails page: the types are replaced, the old approved fields go, the fields of the removed try-on e-mails go, the rest stays, and a value of null takes a setting away', () => {
  const existing = {
    submissionResultEmailEnabled: true,
    submissionResultEmailSendAfterSave: false,
    submissionResultEmailSubjectAfterSave: 'Old subject',
    submissionResultEmailBodyAfterSave: 'Old body {link}',
    submissionResultEmailSendAfterRelatedPhotosReady: true,
    submissionResultEmailSenderName: 'MTK',
    termsUrl: 'https://old.example/terms',
    types: { welcome: { enabled: true, subject: 'Hi' } },
  };
  const next = mergeNotificationSettings(existing, { types: { approved: { enabled: false }, followUp: { enabled: true } }, senderName: null, termsUrl: 'https://new.example/terms' });
  assert.deepEqual(next, {
    termsUrl: 'https://new.example/terms',
    types: { approved: { enabled: false }, followUp: { enabled: true } },
  });
  assert.deepEqual(mergeNotificationSettings(existing, {}), sanitizeNotificationSettings(existing), 'nothing to change: nothing changes');
  assert.equal('types' in mergeNotificationSettings(existing, { types: {} }), false, 'no choices left: the types follow their defaults');
});

test('a switch is the event\'s own choice, else its partner\'s default, else the standard of the type (off for the follow up); a partner default is only a stored true or false', () => {
  assert.equal(switchIsOn('followUp', null), false, 'nothing chosen anywhere: off');
  assert.equal(switchIsOn('followUp', undefined, {}), false);
  assert.equal(switchIsOn('followUp', null, { followUp: true }), true, 'the partner\'s default');
  assert.equal(switchIsOn('followUp', false, { followUp: true }), false, 'the event\'s own off wins');
  assert.equal(switchIsOn('followUp', true, { followUp: false }), true, 'the event\'s own on wins');
  assert.equal(switchIsOn('approved', null, { followUp: false }), true, 'another type keeps its standard');
  assert.deepEqual(partnerSwitchDefaults({ followUpEmail: true }), { followUp: true });
  assert.deepEqual(partnerSwitchDefaults({ followUpEmail: false }), { followUp: false });
  for (const none of [{}, { followUpEmail: null }, { followUpEmail: 'yes' }, { followUpEmail: 1 }, null, undefined]) assert.deepEqual(partnerSwitchDefaults(none as never), {}, JSON.stringify(none));
});

test('the policy of an event reads the partner\'s default only for an e-mail the event never chose, and nothing is copied into the event', () => {
  const partner = partnerSwitchDefaults({ followUpEmail: true });
  assert.equal(normalizeSubmissionEmailPolicy({}, 'en', null, partner).types.followUp.enabled, true);
  assert.equal(normalizeSubmissionEmailPolicy({}, 'en', null, partner).types.followUp.chosen, null, 'no stored choice appears');
  assert.equal(normalizeSubmissionEmailPolicy({ types: { followUp: { enabled: false } } }, 'en', null, partner).types.followUp.enabled, false);
  assert.equal(normalizeSubmissionEmailPolicy({}, 'en', null, partner).types.welcome.enabled, false);
  assert.equal(normalizeSubmissionEmailPolicy({}, 'en').types.followUp.enabled, false, 'without a partner default the standard (off) applies');
});
