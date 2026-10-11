import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserFamilyOf, coarseDeviceOf, deviceClassOf, deviceMetadataOf, storedDeviceClass } from './coarse';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36';
const ANDROID_SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0';
const ANDROID_FACEBOOK = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A.231105.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0.0]';
const IOS_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0 (iPhone14,5)';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WIN_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const WIN_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';
const WIN_OPERA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0';

test('the device class: iPhone and iPad are ios, Android, a computer is desktop, anything else or nothing is unknown', () => {
  assert.equal(deviceClassOf(IPHONE_SAFARI), 'ios');
  assert.equal(deviceClassOf(IPAD_SAFARI), 'ios');
  assert.equal(deviceClassOf(ANDROID_CHROME), 'android');
  assert.equal(deviceClassOf(MAC_SAFARI), 'desktop');
  assert.equal(deviceClassOf(WIN_CHROME), 'desktop');
  assert.equal(deviceClassOf('Mozilla/5.0 (X11; Linux x86_64)'), 'desktop');
  assert.equal(deviceClassOf(''), 'unknown');
  assert.equal(deviceClassOf(undefined), 'unknown');
  assert.equal(deviceClassOf(null), 'unknown');
  assert.equal(deviceClassOf(42), 'unknown');
  assert.equal(deviceClassOf('curl/8.0'), 'unknown');
});

test('the browser family: Edge, Opera, Samsung Internet and the in-app browsers are told from the Chrome and Safari they are built on', () => {
  const expected: Array<[string, string]> = [
    [IPHONE_SAFARI, 'safari'], [IPHONE_CHROME, 'chrome'], [IPAD_SAFARI, 'safari'], [ANDROID_CHROME, 'chrome'], [ANDROID_SAMSUNG, 'samsung'], [ANDROID_FIREFOX, 'firefox'],
    [ANDROID_FACEBOOK, 'in-app'], [IOS_INSTAGRAM, 'in-app'], [MAC_SAFARI, 'safari'], [WIN_CHROME, 'chrome'], [WIN_EDGE, 'edge'], [WIN_FIREFOX, 'firefox'], [WIN_OPERA, 'opera'],
  ];
  for (const [ua, family] of expected) assert.equal(browserFamilyOf(ua), family, ua.slice(0, 70));
  assert.equal(browserFamilyOf('curl/8.0'), 'other');
  assert.equal(browserFamilyOf(''), 'unknown');
  assert.equal(browserFamilyOf(undefined), 'unknown');
});

test('what is kept of a device is two words and nothing else: no version, no model, no build, no operating system version', () => {
  for (const ua of [IPHONE_SAFARI, ANDROID_FACEBOOK, ANDROID_SAMSUNG, WIN_EDGE, MAC_SAFARI]) {
    const kept = JSON.stringify(deviceMetadataOf(ua));
    for (const detail of ['17_5', '15E148', 'Pixel', 'SM-S918B', 'UD1A', '126.0', '10_15_7', 'Win64', 'AppleWebKit', 'Mozilla']) assert.equal(kept.includes(detail), false, `${detail} in ${kept}`);
    assert.deepEqual(Object.keys(deviceMetadataOf(ua)).sort(), ['browserFamily', 'deviceClass', 'deviceType']);
  }
  assert.deepEqual(coarseDeviceOf(IPHONE_SAFARI), { deviceClass: 'ios', browserFamily: 'safari' });
});

test('the legacy device type follows the class', () => {
  assert.equal(deviceMetadataOf(IPHONE_SAFARI).deviceType, 'mobile_ios');
  assert.equal(deviceMetadataOf(ANDROID_CHROME).deviceType, 'mobile_android');
  assert.equal(deviceMetadataOf(WIN_CHROME).deviceType, 'desktop');
  assert.equal(deviceMetadataOf(undefined).deviceType, 'unknown');
});

test('a stored class is read back only if it is one of the four', () => {
  for (const c of ['ios', 'android', 'desktop', 'unknown']) assert.equal(storedDeviceClass(c), c);
  for (const bad of ['iPhone', '', null, undefined, 3, {}]) assert.equal(storedDeviceClass(bad), null);
});
