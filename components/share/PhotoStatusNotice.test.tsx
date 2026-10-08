import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';

type NoticeModule = typeof import('./PhotoStatusNotice');

// The refresher reads the app router, which does not exist outside Next: the router is mocked for the whole file.
async function render(t: TestContext, state: 'waiting' | 'not_approved', settings?: { texts?: Record<string, string> }, language?: 'en' | 'hu'): Promise<string> {
  t.mock.module('next/navigation', { namedExports: { useRouter: () => ({ refresh: () => undefined }) } });
  const { default: PhotoStatusNotice } = (await import('./PhotoStatusNotice?case=' + state + (settings ? '-own' : '') + (language ? `-${language}` : ''))) as NoticeModule;
  return renderToStaticMarkup(
    <MantineProvider>
      <PhotoStatusNotice state={state} eventName="Derby" captureHref="/capture/abc" settings={settings} language={language} />
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

test('the event\'s own waiting texts replace the fixed ones', async (t) => {
  const waiting = await render(t, 'waiting', { texts: { waitingTitle: 'Un attimo', waitingMessage: 'La tua foto attende l\u2019approvazione.' } });
  assert.match(waiting, /Un attimo/);
  assert.match(waiting, /attende l.approvazione/);
  assert.equal(/Waiting for approval/.test(waiting), false);
});

test('the event\'s own not-approved texts replace the fixed ones, the ones it did not write stay the defaults', async (t) => {
  const notApproved = await render(t, 'not_approved', { texts: { takeAnotherPhotoButton: 'Nuova foto', notApprovedHint: 'Puoi riprovare.' } });
  assert.match(notApproved, /Nuova foto/);
  assert.match(notApproved, /Puoi riprovare\./);
  assert.match(notApproved, /could not be approved/, 'the message was not written, so it is the default');
  assert.equal(/Take another photo/.test(notApproved), false);
});

/** The visible words of the markup: tags dropped, entities of quotes decoded. */
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/\s+/g, ' ').trim();

test('in English the waiting notice keeps its words exactly', async (t) => {
  assert.match(words(await render(t, 'waiting', undefined, 'en')), /Waiting for approval Your photo is waiting for approval\. This page updates by itself, and we will email you the link as soon as it is approved\./);
});

test('in English the not-approved notice keeps its words exactly', async (t) => {
  assert.match(words(await render(t, 'not_approved', undefined, 'en')), /Not approved Your photo could not be approved, so it will not be published\. You are welcome to take another photo\. Take another photo/);
});

test('in Hungarian the waiting notice is Hungarian, with no English word left', async (t) => {
  const text = words(await render(t, 'waiting', undefined, 'hu'));
  assert.match(text, /Jóváhagyásra vár A fotód jóváhagyásra vár\. Ez az oldal magától frissül, és amint jóváhagyták, e-mailben elküldjük neked a linket\./);
  assert.equal(/waiting|approval|photo/i.test(text), false, text);
});

test('in Hungarian the not-approved notice, its hint and its button are Hungarian; the button still goes to the capture page', async (t) => {
  const html = await render(t, 'not_approved', undefined, 'hu');
  const text = words(html);
  assert.match(text, /Nincs jóváhagyva A fotódat nem tudtuk jóváhagyni, ezért nem tesszük közzé\. Nyugodtan készíts egy új fotót\. Új fotó készítése/);
  assert.match(html, /href="\/capture\/abc"[^>]*>[\s\S]*Új fotó készítése/);
  assert.equal(/approved|photo|another/i.test(text), false, text);
});

test('in Hungarian the event’s own text wins, and a stored English default counts as not set', async (t) => {
  const text = words(await render(t, 'not_approved', { texts: { notApprovedTitle: 'Most nem jött össze', takeAnotherPhotoButton: 'Take another photo' } }, 'hu'));
  assert.match(text, /Most nem jött össze/);
  assert.match(text, /Új fotó készítése/, 'the English default an editor saved is replaced by the Hungarian one');
  assert.equal(/Take another photo/.test(text), false);
});
