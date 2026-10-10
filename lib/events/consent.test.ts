import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consentCheckboxes, consentPageIsEmpty, consentRecords, isRequiredCheckbox, MAX_CONSENT_CHECKBOXES, safeLinkUrl, sanitizeCheckboxes, shownCheckboxes, withShownCheckboxes } from './consent';

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

// Shown and required on every checkbox (issue 558, owner answer 297).
test('a checkbox keeps "switched off" and "optional" when it is saved; a checkbox that sets neither is stored as before', () => {
  const list = sanitizeCheckboxes([
    { text: 'Plain' },
    { text: 'Off', shown: false },
    { text: 'Optional', required: false, linkUrl: 'https://example.com/o' },
    { text: 'Chosen', required: true },
    { text: 'Junk', shown: 'no', required: 'yes' },
    { text: 'Shown is not stored', shown: true },
  ]);
  assert.deepEqual(list, [{ text: 'Plain' }, { text: 'Off', shown: false }, { text: 'Optional', linkUrl: 'https://example.com/o', required: false }, { text: 'Chosen', required: true }, { text: 'Junk' }, { text: 'Shown is not stored' }]);
});

test('the checkboxes that are switched off are left out of what is shown, a page with all of them off is empty, and a page without a list never is', () => {
  const items = [{ text: 'A' }, { text: 'B', shown: false }, { text: 'C', required: false }];
  assert.deepEqual(shownCheckboxes(items).map((item) => item.text), ['A', 'C']);
  assert.equal(isRequiredCheckbox(items[0]), true);
  assert.equal(isRequiredCheckbox(items[2]), false);
  assert.equal(consentPageIsEmpty({ checkboxes: [{ text: 'A', shown: false }, { text: 'B', shown: false }] }), true);
  assert.equal(consentPageIsEmpty({ checkboxes: items }), false);
  assert.equal(consentPageIsEmpty({ checkboxes: [] }), false, 'an empty list is the older single-text page');
  assert.equal(consentPageIsEmpty({}), false);
});

test('an optional checkbox that was shown and left unticked leaves a record that says so; a switched-off checkbox leaves none', () => {
  const when = '2026-10-10T20:00:00.000Z';
  const records = consentRecords(
    { pageId: 'p', pageType: 'accept' },
    { accepted: true, acceptedAt: when, items: [{ text: 'Terms', linkUrl: 'https://example.com/t' }, { text: 'News', required: false }], unticked: [{ text: 'Offers', required: false }] },
  );
  assert.deepEqual(records, [
    { pageId: 'p', pageType: 'accept', checkboxText: 'Terms', linkUrl: 'https://example.com/t', accepted: true, acceptedAt: when },
    { pageId: 'p', pageType: 'accept', checkboxText: 'News', accepted: true, acceptedAt: when, required: false },
    { pageId: 'p', pageType: 'accept', checkboxText: 'Offers', accepted: false, acceptedAt: when, required: false },
  ]);
  const onlyDeclined = consentRecords({ pageId: 'p', pageType: 'accept', checkboxText: 'old' }, { accepted: true, acceptedAt: when, items: [], unticked: [{ text: 'Offers', required: false }] });
  assert.deepEqual(onlyDeclined, [{ pageId: 'p', pageType: 'accept', checkboxText: 'Offers', accepted: false, acceptedAt: when, required: false }], 'a page whose boxes were all optional and left unticked still leaves its records');
  const sentence = consentRecords({ pageId: 'p', pageType: 'accept' }, { accepted: true, acceptedAt: when, items: [{ text: 'A', required: false }], shownText: 'One sentence' });
  assert.deepEqual(sentence, [{ pageId: 'p', pageType: 'accept', checkboxText: 'A', accepted: true, acceptedAt: when, shownText: 'One sentence', required: false }]);
});

test('a guest is sent the checkboxes that are on only, and no page whose whole list is off; everything else comes back untouched', () => {
  const own = { pageType: 'accept', config: { checkboxes: [{ text: 'A' }, { text: 'B', shown: false }] } };
  const allOff = { pageType: 'accept', config: { checkboxes: [{ text: 'A', shown: false }] } };
  const untouched = { pageType: 'accept', config: { checkboxes: [{ text: 'A' }, { text: 'B', required: false }] } };
  const single = { pageType: 'accept', config: { checkboxText: 'One' } };
  const login = { pageType: 'who-are-you', config: { checkboxes: [{ text: 'not a consent page', shown: false }] } };
  const out = withShownCheckboxes([own, allOff, untouched, single, login]);
  assert.equal(out.length, 4);
  assert.deepEqual(out[0].config, { checkboxes: [{ text: 'A' }] });
  assert.equal(out[1], untouched);
  assert.equal(out[2], single);
  assert.equal(out[3], login);
});
