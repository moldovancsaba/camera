import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capturePopupResponse } from './capture-popup';

const popupId = '11111111-1111-4111-8111-111111111111';

test('the callback notifies only the one capture tab that opened this sign-in', async () => {
  const response = capturePopupResponse(popupId, 'completed');
  const html = await response.text();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(html, new RegExp(`camera-social-login:${popupId}`));
  assert.match(html, new RegExp(`"popupId":"${popupId}"`));
  assert.match(html, /"status":"completed"/);
});

test('an OAuth failure notifies the same capture attempt without exposing provider details', async () => {
  const html = await capturePopupResponse(popupId, 'failed').text();
  assert.match(html, new RegExp(`"popupId":"${popupId}"`));
  assert.match(html, /"status":"failed"/);
  assert.doesNotMatch(html, /access_token|refresh_token|email/);
});

test('an untrusted popup id cannot be embedded into the callback page', async () => {
  const response = capturePopupResponse('"</script><script>alert(1)', 'completed');
  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'Invalid capture login');
});
