import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';

type Props = { message: string; logoUrl?: string | null; logoAlt?: string };

// next/image needs the Next runtime; here it is a plain <img>.
async function load(t: TestContext, tag: string) {
  t.mock.module('next/image', {
    defaultExport: ({ src, alt, fill, unoptimized, ...rest }: Record<string, unknown>) => {
      void fill; void unoptimized;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={String(src)} alt={String(alt)} {...(rest as object)} />;
    },
  });
  const { default: ProcessingOverlay } = (await import('./ProcessingOverlay?case=' + tag)) as { default: (props: Props) => React.ReactElement };
  return (props: Partial<Props> = {}) =>
    renderToStaticMarkup(
      <MantineProvider>
        <ProcessingOverlay message="Fotó mentése..." {...props} />
      </MantineProvider>
    );
}

test('the saving message is a card on a veil that covers the whole screen, announced to a screen reader', async (t) => {
  const render = await load(t, 'card');
  const html = render();
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /fixed inset-0/);
  assert.match(html, /Fotó mentése\.\.\./);
  assert.match(html, /data-event-card/, 'the words sit on a card of the event, never directly on the picture');
});

test('the veil and the spinner take their colours from the event\'s theme, never a fixed black', async (t) => {
  const render = await load(t, 'theme');
  const html = render();
  assert.match(html, /var\(--event-bg\)/);
  assert.match(html, /var\(--event-button-bg\)/);
  assert.doesNotMatch(html, /bg-black|rgba\(0, ?0, ?0/);
});

test('the event logo is shown above the message when the event has one', async (t) => {
  const render = await load(t, 'logo');
  assert.match(render({ logoUrl: 'https://img.example/logo.png', logoAlt: 'Event logo' }), /alt="Event logo"/);
  assert.doesNotMatch(render(), /<img/);
});
