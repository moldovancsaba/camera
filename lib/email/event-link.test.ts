import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureLinkOf, emailFactsOf, eventLinkOf, shortLinkOf } from './event-link';

test('an event with a URL slug is linked by its short link, the editor’s setting, and one without by its capture page', () => {
  assert.equal(shortLinkOf({ shortUrlSlug: 'mtk-vasas' }, 'https://go.example/'), 'https://go.example/mtk-vasas');
  assert.equal(shortLinkOf({ shortUrlSlug: '  MTK-Vasas ' }, 'https://go.example'), 'https://go.example/mtk-vasas', 'trimmed and in lower case, as the slug is stored');
  for (const bad of [undefined, null, '', '  ', 'a b', '-x', 'x/y', 7, 'x'.repeat(64)]) assert.equal(shortLinkOf({ shortUrlSlug: bad }, 'https://go.example'), null, String(bad));
  assert.equal(shortLinkOf(null), null);
  assert.equal(captureLinkOf('a b', 'https://camera.test/'), 'https://camera.test/capture/a%20b');
});

test('the link to an event: the short link when it has a slug, else the capture page by its uuid, else its id', () => {
  const withSlug = eventLinkOf({ shortUrlSlug: 'mtk', eventId: 'uuid-1' });
  assert.match(withSlug ?? '', /\/mtk$/);
  assert.equal((withSlug ?? '').includes('/capture/'), false);
  assert.match(eventLinkOf({ eventId: 'uuid-1' }) ?? '', /\/capture\/uuid-1$/);
  assert.match(eventLinkOf({ _id: 'abc123' }) ?? '', /\/capture\/abc123$/);
  assert.equal(eventLinkOf({}), null);
  assert.equal(eventLinkOf(null), null);
});

test('the facts an e-mail knows about an event carry its link', () => {
  assert.match(emailFactsOf({ name: 'Derby', shortUrlSlug: 'derby', eventId: 'u' }).eventLink ?? '', /\/derby$/);
  assert.equal(emailFactsOf({ name: 'Derby' }).eventLink, undefined);
  assert.equal(emailFactsOf({ name: 'Derby' }).name, 'Derby');
});
