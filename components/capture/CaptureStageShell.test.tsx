import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import EventThemeScope from '@/components/theme/EventThemeScope';
import { resolveEventTheme, type EventTheme } from '@/lib/theme/event-theme';

// Which logo a guest sees on top of a stage page (login, consent, call to action, restart): the event's own logo for these pages (the first active
// logo of the scenario onboarding-thankyou, which the capture page passes in), else the theme's logo (the partner's logo from messmass), else the
// event's emoji. The libraries (camera#367) must not change this; the test keeps it.
const EVENT_LOGO = 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/event.png';
const PARTNER_LOGO = 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/partner.png';

type ShellModule = typeof import('./CaptureStageShell');

// next/image needs the Next runtime; here it is a plain <img>.
async function load(t: TestContext, tag: string): Promise<ShellModule['default']> {
  t.mock.module('next/image', {
    defaultExport: ({ src, alt, unoptimized, ...rest }: Record<string, unknown>) => {
      void unoptimized;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={String(src)} alt={String(alt)} {...(rest as object)} />;
    },
  });
  return ((await import('./CaptureStageShell?case=' + tag)) as ShellModule).default;
}

function render(CaptureStageShell: ShellModule['default'], logoUrl: string | null | undefined, theme: EventTheme | null) {
  const shell = (
    <CaptureStageShell title="Before we start" logoUrl={logoUrl}>
      <p>content</p>
    </CaptureStageShell>
  );
  return renderToStaticMarkup(<MantineProvider>{theme ? <EventThemeScope theme={theme}>{shell}</EventThemeScope> : shell}</MantineProvider>);
}
const images = (html: string) => [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((match) => match[1]);
const withLogo: EventTheme = { ...resolveEventTheme({}), logoUrl: PARTNER_LOGO, emoji: null };
const withEmoji: EventTheme = { ...resolveEventTheme({}), logoUrl: null, emoji: '⚽' };

test("the event's own logo for these pages comes first", async (t) => {
  const Shell = await load(t, 'own');
  assert.deepEqual(images(render(Shell, EVENT_LOGO, withLogo)), [EVENT_LOGO]);
});

test("without one, the theme's logo (the partner's logo from messmass) is shown", async (t) => {
  const Shell = await load(t, 'theme');
  assert.deepEqual(images(render(Shell, null, withLogo)), [PARTNER_LOGO]);
  assert.deepEqual(images(render(Shell, undefined, withLogo)), [PARTNER_LOGO]);
});

test("without any logo, the event's emoji is shown, and nothing without a theme", async (t) => {
  const Shell = await load(t, 'emoji');
  const emoji = render(Shell, null, withEmoji);
  assert.deepEqual(images(emoji), []);
  assert.ok(emoji.includes('⚽'));
  const bare = render(Shell, null, null);
  assert.deepEqual(images(bare), []);
  assert.equal(bare.includes('⚽'), false);
});
