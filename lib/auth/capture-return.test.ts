import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest, NextResponse } from 'next/server';
import {
  CAPTURE_RETURN_COOKIE,
  captureReturnForLogin,
  captureReturnPath,
  clearCaptureReturn,
  decodeCaptureReturn,
  encodeCaptureReturn,
  parseCaptureReturn,
  readCaptureReturn,
  setCaptureReturnCookie,
} from './capture-return';
import { socialLoginHref } from './social-login';

const EVENT = '6a6ce7b410a8e78560d63636';
const ORIGIN = 'https://camera.example.test';
const request = (url: string, headers: Record<string, string> = {}) => new NextRequest(`${ORIGIN}${url}`, { headers });

test('only a capture event id is accepted, so a login can never send a guest anywhere else', () => {
  assert.deepEqual(parseCaptureReturn(EVENT, '3'), { eventId: EVENT, page: 3 });
  assert.deepEqual(parseCaptureReturn('99b00c3c-60f7-435f-9602-b0af24aac6ff'), { eventId: '99b00c3c-60f7-435f-9602-b0af24aac6ff', page: null });
  for (const bad of ['../admin', '/admin', 'a', 'x'.repeat(65), 'abc/def', 'https://evil.test', '', null, undefined, 5]) assert.equal(parseCaptureReturn(bad), null, String(bad));
  assert.equal(parseCaptureReturn(EVENT, '-1')?.page, null);
  assert.equal(parseCaptureReturn(EVENT, 'abc')?.page, null);
  assert.equal(parseCaptureReturn(EVENT, '123')?.page, null);
});

test('the target survives the cookie and opens the capture page, resuming at the step when it is known', () => {
  const withPage = { eventId: EVENT, page: 0 };
  assert.deepEqual(decodeCaptureReturn(encodeCaptureReturn(withPage)), withPage);
  assert.deepEqual(decodeCaptureReturn(encodeCaptureReturn({ eventId: EVENT, page: null })), { eventId: EVENT, page: null });
  assert.equal(decodeCaptureReturn(''), null);
  assert.equal(decodeCaptureReturn('/admin:1'), null);
  assert.equal(captureReturnPath(withPage), `/capture/${EVENT}?resume=true&page=0`);
  assert.equal(captureReturnPath({ eventId: EVENT, page: null }), `/capture/${EVENT}`);
});

test('a login names its target by the link it followed; a dashboard login names none', () => {
  assert.deepEqual(captureReturnForLogin(request(`/api/auth/login?provider=google&captureEvent=${EVENT}&capturePage=2`)), { eventId: EVENT, page: 2 });
  assert.equal(captureReturnForLogin(request('/api/auth/login', { referer: `${ORIGIN}/admin/login` })), null);
  assert.equal(captureReturnForLogin(request('/api/auth/login?captureEvent=../admin')), null);
});

test('the social buttons carry the capture page and step in their link', () => {
  const url = new URL(socialLoginHref('google', { captureEventId: EVENT, capturePage: 0 }), ORIGIN);
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('captureEvent'), EVENT);
  assert.equal(url.searchParams.get('capturePage'), '0');
  assert.equal(new URL(socialLoginHref('facebook'), ORIGIN).searchParams.has('captureEvent'), false);
});

test('the target is recorded on the redirect to SSO, read back by the callback, and cleared once used', () => {
  const out = NextResponse.redirect(`${ORIGIN}/sso`);
  setCaptureReturnCookie(out, { eventId: EVENT, page: 1 });
  const recorded = out.cookies.get(CAPTURE_RETURN_COOKIE);
  assert.equal(recorded?.value, `${EVENT}:1`);

  const back = request('/api/auth/callback', { cookie: `${CAPTURE_RETURN_COOKIE}=${encodeURIComponent(`${EVENT}:1`)}` });
  assert.deepEqual(readCaptureReturn(back), { eventId: EVENT, page: 1 });

  const done = NextResponse.redirect(`${ORIGIN}/capture/${EVENT}`);
  clearCaptureReturn(done);
  assert.equal(done.cookies.get(CAPTURE_RETURN_COOKIE)?.value, '');

  // A dashboard login removes a target left by an abandoned selfie login.
  const dashboard = NextResponse.redirect(`${ORIGIN}/sso`);
  setCaptureReturnCookie(dashboard, null);
  assert.equal(dashboard.cookies.get(CAPTURE_RETURN_COOKIE)?.value, '');
});

test('a login started by an older page (its own cookies) still returns to the capture page', () => {
  const legacy = request('/api/auth/callback', { cookie: `captureEventId=${EVENT}; capturePageIndex=0` });
  assert.deepEqual(readCaptureReturn(legacy), { eventId: EVENT, page: 0 });
  assert.equal(readCaptureReturn(request('/api/auth/callback')), null);
});
