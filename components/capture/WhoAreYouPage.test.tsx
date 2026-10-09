import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import UiLanguageProvider from '@/components/i18n/UiLanguageProvider';
import { acceptanceSentence } from '@/lib/events/acceptance';
import { defaultConsentCheckboxes } from '@/lib/events/default-pages';
import WhoAreYouPage from './WhoAreYouPage';

const noop = () => undefined;
const config = { title: 'Ki vagy te?', description: 'Jelentkezz be.', nameLabel: 'A neved', emailLabel: 'Az e-mail-címed', buttonText: 'Tovább', enableSSOLogin: true, enablePseudoReg: true };
const render = (acceptance?: Parameters<typeof WhoAreYouPage>[0]['acceptance']) =>
  renderToStaticMarkup(
    <MantineProvider>
      <UiLanguageProvider language="hu">
        <WhoAreYouPage config={config} acceptance={acceptance} onNext={noop} eventId="e1" pageIndex={0} />
      </UiLanguageProvider>
    </MantineProvider>,
  );
const sentence = acceptanceSentence(defaultConsentCheckboxes('hu'), 'hu');

test('without the acceptance the page is as it was: sign-in links, enabled fields, no checkbox', () => {
  const html = render();
  assert.ok(!html.includes('data-acceptance'));
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 0);
  assert.ok(html.includes('href="/api/auth/login'), 'the sign-in buttons are links');
  assert.ok(!/<input[^>]*disabled/.test(html), 'the fields are on');
});

test('with the acceptance it is the client\'s sentence in one checkbox above the sign-in, and everything is off until it is ticked', () => {
  const html = render({ sentence, checked: false, onChange: noop });
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 1, 'one checkbox, not three');
  const plain = html.replace(/<[^>]+>/g, '');
  assert.ok(plain.includes('Elfogadom az Általános Szerződési Feltételeket, tudomásul veszem az Adatkezelési tájékoztatót és a Sütikezelési tájékoztatót'));
  for (const href of ['https://seyuselfies.com/hu/legal/terms', 'https://seyuselfies.com/hu/policies', 'https://seyuselfies.com/hu/legal/cookies']) assert.ok(html.includes(`href="${href}"`), href);
  assert.equal((html.match(/target="_blank"/g) ?? []).length, 3, 'each document opens in a new tab');
  assert.ok(html.indexOf('data-acceptance') < html.indexOf('data-brand-signin'), 'it sits under the intro text, above the sign-in buttons');
  assert.ok(!html.includes('href="/api/auth/login'), 'no sign-in address to follow while it is not ticked');
  assert.equal((html.match(/aria-disabled="true"/g) ?? []).length, 2, 'both sign-in buttons say they are off');
  assert.ok(/<input[^>]*disabled[^>]*placeholder|<input[^>]*placeholder[^>]*disabled/.test(html) || (html.match(/<input[^>]*disabled/g) ?? []).length >= 3, 'the name and e-mail fields are off');
  assert.match(html, /<button[^>]*disabled[^>]*>/, 'and so is the continue button');
});

test('ticked already (the user came back to the page): the page is on, the sign-in buttons are links again', () => {
  const html = render({ sentence, checked: true, onChange: noop });
  assert.ok(html.includes('href="/api/auth/login'));
  assert.ok(!html.includes('aria-disabled="true"'));
  assert.ok(!/<button[^>]*disabled/.test(html));
});
