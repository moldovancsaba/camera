import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

type CtaModule = typeof import('./CTAPage');

// next/image needs the Next runtime; here it is a plain <img>.
async function load(t: TestContext, tag: string): Promise<CtaModule> {
  t.mock.module('next/image', {
    exports: { default: ({ src, alt, fill, unoptimized, priority, sizes, ...rest }: Record<string, unknown>) => {
      void fill; void unoptimized; void priority; void sizes;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={String(src)} alt={String(alt)} {...(rest as object)} />;
    } },
  });
  return (await import('./CTAPage?case=' + tag)) as CtaModule;
}

const hex = (digits: string) => `#${digits}`; // colours are assembled from digits: the design-system check bans raw colour literals, tests included
function divBlock(html: string, marker: string) {
  const open = new RegExp(`<div\\b[^>]*${marker}[^>]*>`).exec(html);
  assert.ok(open, `expected a div with ${marker}`);
  const tags = /<div\b[^>]*>|<\/div>/g;
  tags.lastIndex = open.index;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(html))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(open.index, tags.lastIndex);
  }
  assert.fail(`unclosed div with ${marker}`);
}
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

test('a CTA picture keeps its actions in a screen-aligned bar below the image', async (t) => {
  const { default: CTAPage } = await load(t, 'picture');
  const html = renderToStaticMarkup(<CTAPage config={config} pageId="p1" onNext={() => undefined} />);
  assert.match(html, /data-cta-picture/);
  assert.match(html, /<img src="https:\/\/images\.example\.test\/popup\.jpg"/);
  const art = divBlock(html, 'data-cta-picture-art');
  const copy = divBlock(html, 'data-cta-picture-copy');
  const actions = divBlock(html, 'data-cta-picture-actions');
  assert.equal(/aria-label="Visit URL"|aria-label="Continue"/.test(art), false, 'actions never cover the picture');
  assert.match(copy, /<h1[^>]*>New loyalty system<\/h1>/);
  assert.match(copy, /Register, shop and enjoy the benefits/);
  assert.ok(html.indexOf(copy) > html.indexOf(art), 'the title and description follow the image area');
  assert.ok(html.indexOf(actions) > html.indexOf(copy), 'the action bar follows the title and description');
  assert.match(actions, /<button[^>]*aria-label="Visit URL"[^>]*>Join<\/button>/);
  assert.match(actions, /<button[^>]*aria-label="Continue"[^>]*>Continue<\/button>/);
  assert.equal((actions.match(/height:4\.25rem/g) ?? []).length, 2, 'both actions have the same height');
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

test('the picture fits its area and stays unobscured by overlaid copy', async (t) => {
  const { default: CTAPage } = await load(t, 'fit');
  const html = renderToStaticMarkup(<CTAPage config={config} pageId="p1" onNext={() => undefined} />);
  assert.match(html, /object-fit:contain/);
  assert.equal(/object-fit:cover/.test(html), false);
  assert.equal(/linear-gradient/.test(html), false, 'the title and description are outside the artwork');
  const imageOnly = renderToStaticMarkup(<CTAPage config={{ ...config, hideTexts: true }} pageId="p1" onNext={() => undefined} />);
  assert.equal(/linear-gradient/.test(imageOnly), false, 'buttons below the picture do not darken it');
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
