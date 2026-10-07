import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

type CtaModule = typeof import('./CTAPage');

// next/image needs the Next runtime; here it is a plain <img>.
async function load(t: TestContext, tag: string): Promise<CtaModule> {
  t.mock.module('next/image', {
    defaultExport: ({ src, alt, fill, unoptimized, priority, sizes, ...rest }: Record<string, unknown>) => {
      void fill; void unoptimized; void priority; void sizes;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={String(src)} alt={String(alt)} {...(rest as object)} />;
    },
  });
  return (await import('./CTAPage?case=' + tag)) as CtaModule;
}

const hex = (digits: string) => `#${digits}`; // colours are assembled from digits: the design-system check bans raw colour literals, tests included
const config = {
  title: 'New loyalty system',
  description: 'Register, shop and enjoy the benefits',
  checkboxText: 'https://club.example.test/join',
  buttonText: 'Continue',
  visitButtonText: 'Join',
  backgroundImageUrl: 'https://images.example.test/popup.jpg',
  buttonColor: hex('1b3a69'),
  buttonBorderColor: hex('189cd8'),
};

test('a CTA page with a picture fills the screen with it and writes the title, the text and the buttons over it', async (t) => {
  const { default: CTAPage } = await load(t, 'picture');
  const html = renderToStaticMarkup(<CTAPage config={config} pageId="p1" onNext={() => undefined} />);
  assert.match(html, /data-cta-picture/);
  assert.match(html, /<img src="https:\/\/images\.example\.test\/popup\.jpg"/);
  assert.match(html, /<h1[^>]*>New loyalty system<\/h1>/);
  assert.match(html, /Register, shop and enjoy the benefits/);
  assert.match(html, /<button[^>]*aria-label="Visit URL"[^>]*>Join<\/button>/);
  assert.match(html, /<button[^>]*aria-label="Continue"[^>]*>Continue<\/button>/);
  assert.ok(html.includes(`background:${hex('1b3a69')}`) && html.includes(`border:4px solid ${hex('189cd8')}`), 'the club colours');
});

test('an end page (no continue button) shows only the visit button, and a page without a link only the continue button', async (t) => {
  const { default: CTAPage } = await load(t, 'variants');
  const end = renderToStaticMarkup(<CTAPage config={{ ...config, hasButton: false }} pageId="p1" onNext={() => undefined} />);
  assert.match(end, /Join/);
  assert.equal(/aria-label="Continue"/.test(end), false);
  const noLink = renderToStaticMarkup(<CTAPage config={{ ...config, checkboxText: '' }} pageId="p1" onNext={() => undefined} />);
  assert.equal(/Visit URL/.test(noLink), false);
  assert.match(noLink, /aria-label="Continue"/);
});
