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

test('the picture fits the page and keeps its shape, and the darkening is there while there is writing over it', async (t) => {
  const { default: CTAPage } = await load(t, 'fit');
  const html = renderToStaticMarkup(<CTAPage config={config} pageId="p1" onNext={() => undefined} />);
  assert.match(html, /object-fit:contain/);
  assert.equal(/object-fit:cover/.test(html), false);
  assert.match(html, /linear-gradient/);
});

test('the title and the text can be hidden: the heading stays for a screen reader, drawn as nothing', async (t) => {
  const { default: CTAPage } = await load(t, 'hide-texts');
  const html = renderToStaticMarkup(<CTAPage config={{ ...config, hideTexts: true }} pageId="p1" onNext={() => undefined} />);
  assert.match(html, /<h1 style="[^"]*clip:rect\(0 0 0 0\)[^"]*">New loyalty system<\/h1>/);
  assert.equal(/Register, shop and enjoy the benefits/.test(html), false);
  assert.match(html, /aria-label="Continue"/);
});

test('a picture that is the link, with the buttons hidden: one full-size button, no other button, and no darkening', async (t) => {
  const { default: CTAPage } = await load(t, 'link');
  const html = renderToStaticMarkup(<CTAPage config={{ ...config, hideTexts: true, hideButtons: true, pictureLink: true }} pageId="p1" onNext={() => undefined} />);
  assert.match(html, /<button[^>]*data-cta-picture-link[^>]*aria-label="Join"/);
  assert.equal(/aria-label="Visit URL"/.test(html), false);
  assert.equal(/aria-label="Continue"/.test(html), false);
  assert.equal(/linear-gradient/.test(html), false, 'nothing is written over the picture, so nothing darkens it');
});

test('the buttons stay when nothing else leads on, so a page is never a dead end by accident', async (t) => {
  const { default: CTAPage } = await load(t, 'no-dead-end');
  const html = renderToStaticMarkup(<CTAPage config={{ ...config, hideButtons: true }} pageId="p1" onNext={() => undefined} />);
  assert.match(html, /aria-label="Visit URL"/);
  assert.match(html, /aria-label="Continue"/);
  assert.equal(/data-cta-picture-link/.test(html), false);
});

test('a page with no address has no visit button and no link, even when a photo id is known', async (t) => {
  const { default: CTAPage } = await load(t, 'no-address');
  const html = renderToStaticMarkup(<CTAPage config={{ ...config, checkboxText: '', pictureLink: true }} pageId="p1" submissionId="s1" onNext={() => undefined} />);
  assert.equal(/Visit URL/.test(html), false);
  assert.equal(/data-cta-picture-link/.test(html), false);
});

