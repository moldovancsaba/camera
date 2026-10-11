/**
 * The cookie checkbox of a landing page (issue 558): shown or not (`enabled`, which it always had) and required or optional (`required`). The markup of the required box, and of a page with
 * the checkbox off, is held to what the component drew before the setting existed (`__golden__/`; `--update-golden` writes it again from the component as it is).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import LandingPageCookieConsent from './LandingPageCookieConsent';

const dir = join(dirname(fileURLToPath(import.meta.url)), '__golden__');
const write = process.argv.includes('--update-golden');
function expectGolden(name: string, html: string): void {
  const file = join(dir, `${name}.html`);
  if (write) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, html);
    return;
  }
  assert.ok(existsSync(file), `${name}: the expected markup is missing`);
  assert.equal(html, readFileSync(file, 'utf8'), `${name}: the markup changed`);
}
const render = (props: Partial<Parameters<typeof LandingPageCookieConsent>[0]>) => renderToStaticMarkup(<LandingPageCookieConsent slug="s" enabled url="https://example.com/go" buttonText="Go" {...props} />);

test('the required cookie checkbox, and a page with the checkbox off, are drawn as before', () => {
  expectGolden('landing-cookie-required', render({}));
  expectGolden('landing-cookie-off', render({ enabled: false }));
});

test('an optional cookie checkbox is marked and the link works without it; a required one keeps the link off until it is ticked', () => {
  const required = render({});
  assert.match(required, /aria-disabled="true"/, 'the link waits for the tick');
  assert.ok(!required.includes('(optional)'));
  const optional = render({ required: false });
  assert.ok(optional.includes('(optional)'));
  assert.ok(optional.includes('href="https://example.com/go"'), 'the link works at once');
  assert.match(optional, /aria-disabled="false"/);
  assert.ok(!render({ enabled: false, required: false }).includes('type="checkbox"'), 'off: no checkbox at all');
});
