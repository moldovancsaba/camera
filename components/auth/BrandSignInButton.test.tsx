import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CAMERA_STAGE_WHITE, SOCIAL_FACEBOOK_BLUE, SOCIAL_GOOGLE_BLUE, SOCIAL_GOOGLE_BUTTON_FILL, SOCIAL_GOOGLE_BUTTON_STROKE, SOCIAL_GOOGLE_BUTTON_TEXT, SOCIAL_GOOGLE_GREEN, SOCIAL_GOOGLE_RED, SOCIAL_GOOGLE_YELLOW } from '@/lib/gds/tokens/colors';
import BrandSignInButton from './BrandSignInButton';

const lower = (s: string) => s.toLowerCase();

test('the Google button is a white link with a thin grey border, dark text and the four-colour G, and the G is hidden from screen readers', () => {
  const html = renderToStaticMarkup(<BrandSignInButton provider="google" href="/api/auth/login?provider=google" label="Continue with Google" />);
  assert.match(html, /<a href="\/api\/auth\/login\?provider=google"/);
  assert.match(html, /data-brand-signin="google"/);
  assert.ok(lower(html).includes(`background:${lower(SOCIAL_GOOGLE_BUTTON_FILL)}`), 'white');
  assert.ok(lower(html).includes(`1px solid ${lower(SOCIAL_GOOGLE_BUTTON_STROKE)}`), 'thin grey border');
  assert.ok(lower(html).includes(`color:${lower(SOCIAL_GOOGLE_BUTTON_TEXT)}`), 'dark text');
  for (const colour of [SOCIAL_GOOGLE_RED, SOCIAL_GOOGLE_BLUE, SOCIAL_GOOGLE_YELLOW, SOCIAL_GOOGLE_GREEN]) assert.ok(lower(html).includes(`fill="${lower(colour)}"`), `the G has ${colour}`);
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.match(html, /<span>Continue with Google<\/span>/);
});

test('the Facebook button is the Facebook blue with white text and the white f', () => {
  const html = renderToStaticMarkup(<BrandSignInButton provider="facebook" href="/api/auth/login?provider=facebook" label="Folytatás Facebookkal" />);
  assert.match(html, /data-brand-signin="facebook"/);
  assert.ok(lower(html).includes(`background:${lower(SOCIAL_FACEBOOK_BLUE)}`));
  assert.ok(lower(html).includes(`color:${lower(CAMERA_STAGE_WHITE)}`));
  assert.ok(lower(html).includes(`fill="${lower(CAMERA_STAGE_WHITE)}"`), 'the f is white');
  assert.match(html, /<span>Folytatás Facebookkal<\/span>/);
});

test('both are at least 48 px tall, as wide as their place, and on one line', () => {
  for (const provider of ['google', 'facebook'] as const) {
    const html = renderToStaticMarkup(<BrandSignInButton provider={provider} href="/x" label="Label" />);
    assert.match(html, /min-height:48px/);
    assert.match(html, /width:100%/);
    assert.match(html, /white-space:nowrap/);
  }
});
