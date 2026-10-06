import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';

type NoticeModule = typeof import('./PhotoStatusNotice');

// The refresher reads the app router, which does not exist outside Next: the router is mocked for the whole file.
async function render(t: TestContext, state: 'waiting' | 'not_approved'): Promise<string> {
  t.mock.module('next/navigation', { namedExports: { useRouter: () => ({ refresh: () => undefined }) } });
  const { default: PhotoStatusNotice } = (await import('./PhotoStatusNotice?case=' + state)) as NoticeModule;
  return renderToStaticMarkup(
    <MantineProvider>
      <PhotoStatusNotice state={state} eventName="Derby" captureHref="/capture/abc" />
    </MantineProvider>
  );
}

test('a photo that is waiting says so, offers no retake, and shows no picture', async (t) => {
  const html = await render(t, 'waiting');
  assert.match(html, /waiting for approval/i);
  assert.match(html, /data-share-state="waiting"/);
  assert.equal(/Take another photo/.test(html), false);
  assert.equal(/<img|<canvas/.test(html), false);
});

test('a photo that is not approved gets a notice and a way to take another one, and no picture', async (t) => {
  const html = await render(t, 'not_approved');
  assert.match(html, /could not be approved/);
  assert.match(html, /href="\/capture\/abc"[^>]*>[\s\S]*Take another photo/);
  assert.match(html, /data-share-state="not_approved"/);
  assert.equal(/<img|<canvas/.test(html), false);
});
