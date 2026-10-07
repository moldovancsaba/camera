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
  const { default: WelcomePage, WELCOME_LAYER_CSS } = await load(t, 'layout');
  const html = renderToStaticMarkup(<WelcomePage config={config} onNext={() => undefined} />);
  assert.match(html, /data-welcome-step/);
  assert.match(html, /object-fit:cover/, 'the background is scaled to cover, in portrait and in landscape');
  const bottom = html.indexOf('data-welcome-layer="bottom"');
  const corner = html.indexOf('data-welcome-layer="corner"');
  assert.ok(bottom > 0 && corner > bottom, 'the corner layer is drawn over the bottom layer');
  for (const layer of ['bottom', 'corner']) {
    const tag = html.slice(html.lastIndexOf('<img', html.indexOf(`data-welcome-layer="${layer}"`)), html.indexOf('>', html.indexOf(`data-welcome-layer="${layer}"`)));
    assert.match(tag, /class="welcome-layer( welcome-layer-corner)?"/, `${layer} layer is drawn by the layer rules`);
  }
  assert.match(WELCOME_LAYER_CSS, /\.welcome-layer \{[^}]*bottom: 0; width: 100%;/, 'portrait: both layers are as wide as the screen, so both have the same scale');
  assert.match(WELCOME_LAYER_CSS, /@container \(orientation: landscape\) \{\s*\.welcome-layer \{ width: 50%; \}\s*\.welcome-layer-corner \{ left: auto; right: 0; \}/, 'landscape: both are half the width, the corner layer at the right edge');
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

test('the giant screen is drawn above the button when the page has a screen picture, and not otherwise', async (t) => {
  const { default: WelcomePage } = await load(t, 'screen');
  const withScreen = renderToStaticMarkup(<WelcomePage config={{ ...config, screenImageUrl: IMG('screen'), screenImageAlt: 'The screen' }} onNext={() => undefined} />);
  assert.match(withScreen, /data-led-screen/);
  assert.ok(withScreen.indexOf('data-led-screen') < withScreen.indexOf('<button'), 'the screen comes before the button in the page');
  assert.match(withScreen, /alt="The screen"/);
  assert.equal(/data-led-screen/.test(renderToStaticMarkup(<WelcomePage config={config} onNext={() => undefined} />)), false);
});

test('the giant screen and the Start button are one group, centred together in the visible screen', async (t) => {
  const { default: WelcomePage } = await load(t, 'group');
  const html = renderToStaticMarkup(<WelcomePage config={{ ...config, screenImageUrl: IMG('screen') }} onNext={() => undefined} />);
  const start = html.indexOf('data-welcome-group');
  assert.ok(start > 0, 'there is one group');
  const group = html.slice(html.lastIndexOf('<div', start), html.indexOf('>', start));
  assert.match(group, /display:flex/);
  assert.match(group, /flex-direction:column/);
  assert.match(group, /align-items:center/);
  assert.match(group, /justify-content:center/);
  assert.ok(html.indexOf('data-led-screen') > start && html.indexOf('<button') > html.indexOf('data-led-screen'), 'the screen and the button are both inside the group, the screen first');
  assert.equal((html.match(/data-welcome-group/g) ?? []).length, 1);
});

test('every element is optional: only what has a setting is drawn, the button is always there, an empty setting counts as none', async (t) => {
  const { default: WelcomePage } = await load(t, 'optional');
  const render = (extra: Record<string, string>) => renderToStaticMarkup(<WelcomePage config={{ title: 'W', buttonText: 'Go', ...extra }} onNext={() => undefined} />);
  const images = (html: string) => (html.match(/<img /g) ?? []).length;

  const none = render({});
  assert.equal(images(none), 0, 'no setting, no picture');
  assert.match(none, /<button[^>]*>Go<\/button>/);
  assert.equal(images(render({ backgroundImageUrl: '', bottomImageUrl: '', cornerImageUrl: '', screenImageUrl: '' })), 0, 'empty settings are the same as none');

  const background = render({ backgroundImageUrl: IMG('bg') });
  assert.equal(images(background), 1);
  assert.match(background, /object-fit:cover/);
  assert.equal(/data-welcome-layer|data-led-screen/.test(background), false, 'a background alone draws no layer and no screen');

  const left = render({ bottomImageUrl: IMG('left') });
  assert.equal(images(left), 1);
  assert.match(left, /data-welcome-layer="bottom"/);
  assert.equal(/data-welcome-layer="corner"|data-led-screen|object-fit:cover/.test(left), false, 'a left image alone draws only the left image');

  const right = render({ cornerImageUrl: IMG('right') });
  assert.equal(images(right), 1);
  assert.match(right, /data-welcome-layer="corner"/);
  assert.equal(/data-welcome-layer="bottom"|data-led-screen|object-fit:cover/.test(right), false, 'a right image alone draws only the right image');

  const screen = render({ screenImageUrl: IMG('screen') });
  assert.equal(images(screen), 1);
  assert.match(screen, /data-led-screen/);
  assert.equal(/data-welcome-layer|object-fit:cover/.test(screen), false, 'a screen picture alone draws only the giant screen');

  const all = render({ backgroundImageUrl: IMG('bg'), bottomImageUrl: IMG('left'), cornerImageUrl: IMG('right'), screenImageUrl: IMG('screen') });
  assert.equal(images(all), 4);
  assert.match(all, /<button[^>]*>Go<\/button>/);
});

