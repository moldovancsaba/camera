import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consentCheckboxes, consentRecords, MAX_CONSENT_CHECKBOXES, safeLinkUrl, sanitizeCheckboxes } from './consent';

test('a link is kept only when it is a plain https address', () => {
  assert.equal(safeLinkUrl('https://seyuselfies.com/en/legal/terms'), 'https://seyuselfies.com/en/legal/terms');
  assert.equal(safeLinkUrl('  https://example.com/a  '), 'https://example.com/a');
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'https://user:pw@example.com', 'ftp://x.com', 'not a url', '', '   ', 42, null, undefined, `https://example.com/${'a'.repeat(500)}`]) {
    assert.equal(safeLinkUrl(bad), undefined, String(bad));
  }
});

test('a list keeps the checkboxes that have a text; a bad link drops the link, not the checkbox; spaces are tidied', () => {
  const list = sanitizeCheckboxes([
    { text: '  I accept   the Terms ', linkUrl: 'https://example.com/terms' },
    { text: 'No link', linkUrl: 'http://example.com/insecure' },
    { text: '   ' },
    { linkUrl: 'https://example.com/no-text' },
    'nonsense',
    null,
    { text: 'x'.repeat(301) },
  ]);
  assert.deepEqual(list, [{ text: 'I accept the Terms', linkUrl: 'https://example.com/terms' }, { text: 'No link' }]);
  assert.deepEqual(sanitizeCheckboxes('x'), []);
  assert.deepEqual(sanitizeCheckboxes(undefined), []);
});

test('a list is limited to ten checkboxes', () => {
  assert.equal(sanitizeCheckboxes(Array.from({ length: 25 }, (_, i) => ({ text: `c${i}` }))).length, MAX_CONSENT_CHECKBOXES);
});

test('a page shows its list, else its single checkbox text as a list of one, else nothing', () => {
  assert.deepEqual(consentCheckboxes({ checkboxes: [{ text: 'A' }, { text: 'B' }], checkboxText: 'old' }), [{ text: 'A' }, { text: 'B' }]);
  assert.deepEqual(consentCheckboxes({ checkboxes: [], checkboxText: ' I agree ' }), [{ text: 'I agree' }]);
  assert.deepEqual(consentCheckboxes({ checkboxText: 'I agree' }), [{ text: 'I agree' }]);
  assert.deepEqual(consentCheckboxes({ checkboxes: [{ text: '' }], checkboxText: '' }), []);
  assert.deepEqual(consentCheckboxes({}), []);
});

test('a consent page with a list leaves one record per checkbox with its exact text, link and time; an older page leaves its single record', () => {
  const when = '2026-10-08T10:00:00.000Z';
  const records = consentRecords(
    { pageId: 'default-consent', pageType: 'accept' },
    { accepted: true, acceptedAt: when, items: [{ text: 'I accept the Terms and conditions', linkUrl: 'https://seyuselfies.com/en/legal/terms' }, { text: 'I accept cookies' }] },
  );
  assert.deepEqual(records, [
    { pageId: 'default-consent', pageType: 'accept', checkboxText: 'I accept the Terms and conditions', linkUrl: 'https://seyuselfies.com/en/legal/terms', accepted: true, acceptedAt: when },
    { pageId: 'default-consent', pageType: 'accept', checkboxText: 'I accept cookies', accepted: true, acceptedAt: when },
  ]);
  assert.deepEqual(consentRecords({ pageId: 'p', pageType: 'accept', checkboxText: 'I agree' }, { accepted: true, acceptedAt: when }), [{ pageId: 'p', pageType: 'accept', checkboxText: 'I agree', accepted: true, acceptedAt: when }]);
  assert.deepEqual(consentRecords({ pageId: 'c', pageType: 'cta', checkboxText: 'https://example.com' }, { accepted: true, acceptedAt: when, items: [] }), [{ pageId: 'c', pageType: 'cta', checkboxText: 'https://example.com', accepted: true, acceptedAt: when }]);
});


test('records made from the one checkbox on the Who-are-you page keep the sentence the user read, on every record', () => {
  const items = [{ text: 'I accept the Terms and conditions', linkUrl: 'https://example.test/terms' }, { text: 'I have read the Privacy policy' }];
  const records = consentRecords({ pageId: 'p1', pageType: 'accept' }, { accepted: true, acceptedAt: '2026-10-09T20:00:00.000Z', items, shownText: 'Elfogadom az Általános Szerződési Feltételeket' });
  assert.equal(records.length, 2, 'still one record per document');
  assert.ok(records.every((r) => r.shownText === 'Elfogadom az Általános Szerződési Feltételeket' && r.accepted === true && r.acceptedAt === '2026-10-09T20:00:00.000Z'));
  assert.equal(records[0].linkUrl, 'https://example.test/terms');
  const plain = consentRecords({ pageId: 'p1', pageType: 'accept' }, { accepted: true, acceptedAt: 'x', items });
  assert.ok(plain.every((r) => !('shownText' in r)), 'a separate consent page leaves records as before');
});
