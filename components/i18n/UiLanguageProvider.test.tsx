import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import UiLanguageProvider, { useT } from './UiLanguageProvider';

function Probe() {
  const { t, own, language } = useT();
  return (
    <p data-language={language}>
      {t('event.loading')} | {own('event.loading', 'Loading event...')} | {own('event.loading', 'Egyedi szöveg')}
    </p>
  );
}

test('without a provider the texts are English, as before the language existed', () => {
  const html = renderToStaticMarkup(<Probe />);
  assert.match(html, /data-language="en"/);
  assert.match(html, /Loading event\.\.\. \| Loading event\.\.\. \| Egyedi szöveg/);
});

test('inside a Hungarian provider the dictionary text shows, the stored English default counts as not set, an editor\'s own text wins', () => {
  const html = renderToStaticMarkup(
    <UiLanguageProvider language="hu">
      <Probe />
    </UiLanguageProvider>
  );
  assert.match(html, /data-language="hu"/);
  assert.match(html, /Esemény betöltése\.\.\. \| Esemény betöltése\.\.\. \| Egyedi szöveg/);
});
