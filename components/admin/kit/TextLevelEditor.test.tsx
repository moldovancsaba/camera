import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import TextLevelEditor from './TextLevelEditor';

const render = (props: Partial<React.ComponentProps<typeof TextLevelEditor>> = {}) =>
  renderToStaticMarkup(
    <MantineProvider>
      <TextLevelEditor own={{}} inherited={[]} onSave={() => undefined} {...props} />
    </MantineProvider>
  );

test('every default text is listed in its group with what is used now; with nothing written everything comes from the dictionary', () => {
  const html = render();
  assert.match(html, /Welcome page/);
  assert.match(html, /welcome\.button/);
  assert.match(html, /Used now: Start/);
  assert.match(html, /From the dictionary/);
  assert.doesNotMatch(html, />Own</);
});

test('a text this level wrote is marked Own; a text a level above wrote shows as what is used now and where it comes from', () => {
  const own = render({ own: { en: { 'welcome.button': 'Kick off' } } });
  assert.match(own, /Own/);
  assert.match(own, /value="Kick off"/);
  const inherited = render({ inherited: [{ label: "the partner's wording", texts: { en: { 'welcome.button': 'Club start' } } }] });
  assert.match(inherited, /Used now: Club start/);
  assert.match(inherited, /From the partner&#x27;s wording/);
});

test('the nearest level above wins: the partner over the global wording', () => {
  const html = render({
    inherited: [
      { label: 'the global wording', texts: { en: { 'welcome.button': 'Global start' } } },
      { label: "the partner's wording", texts: { en: { 'welcome.button': 'Partner start' } } },
    ],
  });
  assert.match(html, /Used now: Partner start/);
  assert.doesNotMatch(html, /Used now: Global start/);
});

test('the language chosen decides which wording and which dictionary text are shown', () => {
  const html = render({ initialLanguage: 'hu', own: { hu: { 'welcome.button': 'Indulás' }, en: { 'welcome.button': 'English own' } } });
  assert.match(html, /value="Indulás"/);
  assert.doesNotMatch(html, /English own/);
  assert.match(html, /Used now: Indítás/);
});
