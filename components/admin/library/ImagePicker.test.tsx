import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';

type PickerModule = typeof import('./ImagePicker');

// next/image needs the Next runtime; here it is a plain <img> with the props the thumbnail sets.
async function load(t: TestContext, tag: string): Promise<PickerModule> {
  t.mock.module('next/image', {
    defaultExport: ({ src, alt, unoptimized, ...rest }: Record<string, unknown>) => {
      void unoptimized;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={String(src)} alt={String(alt)} {...(rest as object)} />;
    },
  });
  return (await import('./ImagePicker?case=' + tag)) as PickerModule;
}

const R2 = 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/landing/mtk-vasas/background.jpg';
const EVENT = { scope: 'event' as const, eventId: '0123456789abcdef01234567' };
const render = (Picker: PickerModule['default'], value: string) =>
  renderToStaticMarkup(
    <MantineProvider>
      <Picker label="Background picture" helper="Fills the screen." value={value} onChange={() => undefined} level={EVENT} />
    </MantineProvider>
  );

test('an address that is in no library still shows its picture, next to the address it keeps', async (t) => {
  const { default: ImagePicker } = await load(t, 'existing');
  const html = render(ImagePicker, R2);
  assert.ok(html.includes(`<img src="${R2}"`), 'the preview draws the stored address');
  assert.ok(html.includes(`value="${R2}"`), 'the plain address field holds the same string');
  for (const text of ['Background picture', 'Fills the screen.', 'Picture address', 'Choose from the library', 'Upload here', 'Clear the picture']) assert.ok(html.includes(text), text);
});

test('an empty field says No picture, and nothing can be cleared', async (t) => {
  const { default: ImagePicker } = await load(t, 'empty');
  const html = render(ImagePicker, '');
  assert.match(html, /aria-label="This image has no picture"[^>]*>No picture</);
  assert.ok(html.includes('No picture: nothing is shown.'));
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Clear the picture/, 'Clear the picture is disabled');
});

test('an address still being typed is not drawn', async (t) => {
  const { default: ImagePicker } = await load(t, 'typing');
  const html = render(ImagePicker, 'https:');
  assert.doesNotMatch(html, /<img /);
  assert.ok(html.includes('Not a picture address yet'));
});

test('a field that takes fewer types says so for an address of another type, and keeps the address', async (t) => {
  const { default: ImagePicker } = await load(t, 'types');
  const svg = 'https://store.example.test/crest.svg';
  const html = renderToStaticMarkup(
    <MantineProvider>
      <ImagePicker label="Email footer picture" value={svg} onChange={() => undefined} level={EVENT} fileTypes={['image/png', 'image/jpeg', 'image/webp']} fileTypeWords="PNG, JPEG or WebP" />
    </MantineProvider>
  );
  assert.ok(html.includes('This field takes PNG, JPEG or WebP'));
  assert.ok(html.includes(`value="${svg}"`), 'the field is not changed: the check of the field stays where it was');
  assert.doesNotMatch(render(ImagePicker, R2), /This field takes/, 'a JPEG in a field that takes every type: no warning');
});

test('the picker cannot change how the editor around it saves: no form, no submit button, no required field', async (t) => {
  const { default: ImagePicker } = await load(t, 'inside-a-form');
  const html = render(ImagePicker, R2);
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /required/);
  const buttons = html.match(/<button[^>]*>/g) ?? [];
  assert.ok(buttons.length >= 3);
  for (const button of buttons) assert.match(button, /type="button"/, button);
});
