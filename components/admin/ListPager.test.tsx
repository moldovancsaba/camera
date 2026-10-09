import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ListPager from './ListPager';

const render = (props: Partial<Parameters<typeof ListPager>[0]> = {}) => renderToStaticMarkup(<ListPager basePath="/admin/partners" page={1} pages={6} total={255} pageSize={50} {...props} />);

test('one page needs no pager', () => {
  assert.equal(render({ pages: 1, total: 20 }), '');
});

test('the first page has Next but no Previous link, and says which partners it shows', () => {
  const html = render();
  assert.ok(html.includes('1–50 of 255 · page 1 of 6'));
  assert.ok(html.includes('href="/admin/partners?page=2"') && html.includes('rel="next"'));
  assert.equal(html.includes('rel="prev"'), false);
  assert.ok(html.includes('aria-disabled="true"'));
});

test('a middle page links both ways; going back to page 1 drops the page from the address; the search stays on every link', () => {
  const html = render({ page: 2, query: { search: 'Újpest FC' } });
  assert.ok(html.includes('href="/admin/partners?search=%C3%9Ajpest+FC"'), 'back to the first page: no page=1');
  assert.ok(html.includes('href="/admin/partners?search=%C3%9Ajpest+FC&amp;page=3"'));
});

test('the last page shows the short last range and has no Next link', () => {
  const html = render({ page: 6 });
  assert.ok(html.includes('251–255 of 255 · page 6 of 6'));
  assert.equal(html.includes('rel="next"'), false);
  assert.ok(html.includes('href="/admin/partners?page=5"'));
});
