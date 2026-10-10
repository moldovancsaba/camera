/**
 * The guest pages that carry a consent checkbox, rendered with a configuration that makes no use of the checkbox settings (issue 558, owner answer 297): their markup must be byte-for-byte
 * what the pages drew before the settings existed. The expected markup in `__golden__/` was written from the pages as they were before the settings (`node --import tsx components/capture/consent-defaults.test.tsx --update-golden` writes it again);
 * a later change that moves a single character of the default fails here, so "nothing changes until somebody chooses" is checked by the pages themselves.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import UiLanguageProvider from '@/components/i18n/UiLanguageProvider';
import { acceptanceSentence } from '@/lib/events/acceptance';
import { defaultConsentCheckboxes } from '@/lib/events/default-pages';
import AcceptPage from './AcceptPage';
import WhoAreYouPage from './WhoAreYouPage';

const dir = join(dirname(fileURLToPath(import.meta.url)), '__golden__');
const write = process.argv.includes('--update-golden');

function expectGolden(name: string, html: string): void {
  const file = join(dir, `${name}.html`);
  if (write) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, html);
    return;
  }
  assert.ok(existsSync(file), `${name}: the expected markup is missing`);
  assert.equal(html, readFileSync(file, 'utf8'), `${name}: the markup changed`);
}

const noop = () => undefined;
const accept = (language: 'en' | 'hu', config: Parameters<typeof AcceptPage>[0]['config']) =>
  renderToStaticMarkup(
    <MantineProvider>
      <UiLanguageProvider language={language}>
        <AcceptPage config={config} pageId="p1" onNext={noop} />
      </UiLanguageProvider>
    </MantineProvider>,
  );

test('the default consent page (three documents) is drawn as before, in English and Hungarian', () => {
  for (const language of ['en', 'hu'] as const) {
    expectGolden(`accept-default-${language}`, accept(language, { title: 'Before we start', description: 'Please accept all of the following to continue.', checkboxText: '', buttonText: 'Continue', checkboxes: defaultConsentCheckboxes(language).map((item) => ({ ...item })) }));
  }
});

test('an own consent page with the older single text, and one with a list without links, are drawn as before', () => {
  expectGolden('accept-single', accept('en', { title: 'Terms', description: '', checkboxText: 'I have read and agree to the terms above.', buttonText: 'Next' }));
  expectGolden('accept-list-no-links', accept('en', { title: 'T', description: 'D', checkboxText: 'old text', buttonText: 'Go', checkboxes: [{ text: 'First one' }, { text: 'Second one' }] }));
});

const config = { title: 'Ki vagy te?', description: 'Jelentkezz be.', nameLabel: 'A neved', emailLabel: 'Az e-mail-címed', buttonText: 'Tovább', enableSSOLogin: true, enablePseudoReg: true };
const who = (acceptance?: Parameters<typeof WhoAreYouPage>[0]['acceptance']) =>
  renderToStaticMarkup(
    <MantineProvider>
      <UiLanguageProvider language="hu">
        <WhoAreYouPage config={config} acceptance={acceptance} onNext={noop} eventId="e1" pageIndex={0} />
      </UiLanguageProvider>
    </MantineProvider>,
  );

test('the Who-are-you page without the acceptance, and with it ticked or not, is drawn as before', () => {
  const sentence = acceptanceSentence(defaultConsentCheckboxes('hu'), 'hu');
  expectGolden('who-plain', who());
  expectGolden('who-acceptance-unticked', who({ sentence, checked: false, onChange: noop }));
  expectGolden('who-acceptance-ticked', who({ sentence, checked: true, onChange: noop }));
});
