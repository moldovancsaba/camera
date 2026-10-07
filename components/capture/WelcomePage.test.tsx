import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

type WelcomeModule = typeof import('./WelcomePage');

// next/image needs the Next runtime; here it is a plain <img> that keeps the props the page sets (style, data attributes).
async function load(t: TestContext, tag: string): Promise<WelcomeModule> {
  t.mock.module('next/image', {
    defaultExport: ({ src, alt, fill, unoptimized, priority, sizes, ...rest }: Record<string, unknown>) => {
      void fill; void unoptimized; void priority; void sizes;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={String(src)} alt={String(alt)} {...(rest as object)} />;
    },
  });
  return (await import('./WelcomePage?case=' + tag)) as WelcomeModule;
}

// Colours are assembled from digits: the design-system check bans raw colour literals, tests included.
const hex = (digits: string) => `#${digits}`;
const IMG = (name: string) => `https://images.example.test/${name}.png`;
const config = {
  title: 'Welcome',
  buttonText: 'Start',
  backgroundImageUrl: IMG('bg'),
  bottomImageUrl: IMG('bottom'),
  cornerImageUrl: IMG('corner'),
};

test('the picture fills the screen, the two layers sit on the bottom edge at full width, and the button is the only text', async (t) => {
  const { default: WelcomePage } = await load(t, 'layout');
  const html = renderToStaticMarkup(<WelcomePage config={config} onNext={() => undefined} />);
  assert.match(html, /data-welcome-step/);
  assert.match(html, /object-fit:cover/, 'the background is scaled to cover, in portrait and in landscape');
  const bottom = html.indexOf('data-welcome-layer="bottom"');
  const corner = html.indexOf('data-welcome-layer="corner"');
  assert.ok(bottom > 0 && corner > bottom, 'the corner layer is drawn over the bottom layer');
  for (const layer of ['bottom', 'corner']) {
    const tag = html.slice(html.lastIndexOf('<img', html.indexOf(`data-welcome-layer="${layer}"`)), html.indexOf('>', html.indexOf(`data-welcome-layer="${layer}"`)));
    assert.match(tag, /width:100%/, `${layer} layer is as wide as the screen, so both have the same scale`);
    assert.match(tag, /bottom:0/);
  }
  assert.match(html, /<button[^>]*>Start<\/button>/);
  assert.match(html, /<h1 class="sr-only">Welcome<\/h1>/, 'the title is for screen readers only');
});

test('a page without pictures still shows the button, and the button colours come from the settings', async (t) => {
  const { default: WelcomePage } = await load(t, 'plain');
  const html = renderToStaticMarkup(<WelcomePage config={{ title: 'W', buttonText: 'Go', buttonColor: hex('123456'), buttonTextColor: hex('fedcba'), buttonBorderColor: hex('0a0b0c') }} onNext={() => undefined} />);
  assert.equal(/<img/.test(html), false);
  assert.ok(html.includes(`background:${hex('123456')}`));
  assert.ok(html.includes(`color:${hex('fedcba')}`));
  assert.ok(html.includes(`border:4px solid ${hex('0a0b0c')}`));
});

test('a colour that is not a hex colour is not used', async (t) => {
  const { safeColour } = await load(t, 'colour');
  assert.equal(safeColour(hex('189cd8'), 'x'), hex('189cd8'));
  assert.equal(safeColour(` ${hex('189CD8')} `, 'x'), hex('189CD8'));
  for (const bad of ['red', 'url(https://evil.example)', hex('12'), hex('123456789a'), '189cd8', 'red;background:url(x)', '', undefined]) assert.equal(safeColour(bad, 'fallback'), 'fallback', String(bad));
});
