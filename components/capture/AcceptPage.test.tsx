import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import AcceptPage from './AcceptPage';

const noop = () => undefined;
const render = (config: Parameters<typeof AcceptPage>[0]['config']) =>
  renderToStaticMarkup(
    <MantineProvider>
      <AcceptPage config={config} pageId="p1" onNext={noop} />
    </MantineProvider>,
  );
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

test('a consent page with a list shows one checkbox per item, each with its link opening in a new tab, and the button waits for all of them', () => {
  const html = render({
    title: 'Before we start',
    description: 'Please accept all.',
    checkboxText: '',
    buttonText: 'Continue',
    checkboxes: [
      { text: 'I accept the Terms and conditions', linkUrl: 'https://seyuselfies.com/en/legal/terms' },
      { text: 'I accept cookies', linkUrl: 'https://seyuselfies.com/en/legal/cookies' },
      { text: 'I have read the Privacy policy', linkUrl: 'https://seyuselfies.com/en/policies' },
    ],
  });
  assert.equal(count(html, /type="checkbox"/g), 3);
  assert.equal(count(html, /target="_blank"/g), 3);
  assert.equal(count(html, /rel="noopener noreferrer"/g), 3);
  for (const href of ['https://seyuselfies.com/en/legal/terms', 'https://seyuselfies.com/en/legal/cookies', 'https://seyuselfies.com/en/policies']) assert.ok(html.includes(`href="${href}"`), href);
  for (const text of ['I accept the Terms and conditions', 'I accept cookies', 'I have read the Privacy policy']) assert.ok(html.includes(text), text);
  assert.match(html, /<button[^>]*disabled[^>]*>/, 'nothing is ticked yet, so Continue is switched off');
});

test('a page with only the older single checkbox text still shows one checkbox and no link', () => {
  const html = render({ title: 'Terms', description: '', checkboxText: 'I have read and agree to the terms above.', buttonText: 'Next' });
  assert.equal(count(html, /type="checkbox"/g), 1);
  assert.equal(count(html, /target="_blank"/g), 0);
  assert.ok(html.includes('I have read and agree to the terms above.'));
});

test('a checkbox without a link has no link, and a page with a list ignores the older single text', () => {
  const html = render({ title: 'T', description: '', checkboxText: 'old text', buttonText: 'Go', checkboxes: [{ text: 'Only this one' }] });
  assert.equal(count(html, /type="checkbox"/g), 1);
  assert.equal(count(html, /target="_blank"/g), 0);
  assert.ok(html.includes('Only this one'));
  assert.equal(html.includes('old text'), false);
});
