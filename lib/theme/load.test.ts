import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserFontUrl } from './load';

test('a custom font is asked for at an address that answers with CORS headers', () => {
  const previous = process.env.MESSMASS_BASE_URL;
  try {
    process.env.MESSMASS_BASE_URL = 'https://messmass.com';
    assert.equal(browserFontUrl('/fonts/ASRoma-Regular.woff'), 'https://www.messmass.com/fonts/ASRoma-Regular.woff', 'messmass.com redirects to www, and a redirect has no CORS header');
    process.env.MESSMASS_BASE_URL = 'https://www.messmass.com/';
    assert.equal(browserFontUrl('/fonts/ASRoma-Regular.woff'), 'https://www.messmass.com/fonts/ASRoma-Regular.woff');
    assert.equal(browserFontUrl(null), null);
    delete process.env.MESSMASS_BASE_URL;
    assert.equal(browserFontUrl('/fonts/ASRoma-Regular.woff'), null, 'without the messmass address there is no font file to load');
  } finally {
    if (previous === undefined) delete process.env.MESSMASS_BASE_URL;
    else process.env.MESSMASS_BASE_URL = previous;
  }
});
