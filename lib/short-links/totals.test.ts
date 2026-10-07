import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NO_TOTALS, sameTotals, totalsFromHitRows } from './totals';

test('QR visits add up to visitQrCode with the Android and iPhone split, link visits to visitShortUrl', () => {
  const totals = totalsFromHitRows([
    { kind: 'qr', device: 'android', count: 7 },
    { kind: 'qr', device: 'iphone', count: 5 },
    { kind: 'qr', device: 'other', count: 2 },
    { kind: 'link', device: 'android', count: 3 },
    { kind: 'link', device: 'iphone', count: 4 },
  ]);
  assert.deepEqual(totals, { visitQrCode: 14, visitShortUrl: 7, qrscanAndroid: 7, qrscanIphone: 5 });
});

test('no rows are all zero, and rows of the same kind and device (several days, several links) are summed', () => {
  assert.deepEqual(totalsFromHitRows([]), NO_TOTALS);
  assert.deepEqual(totalsFromHitRows([{ kind: 'qr', device: 'android', count: 1 }, { kind: 'qr', device: 'android', count: 2 }]), { visitQrCode: 3, visitShortUrl: 0, qrscanAndroid: 3, qrscanIphone: 0 });
});

test('a bad count (negative, NaN, fractional) cannot make a total negative or fractional', () => {
  const totals = totalsFromHitRows([{ kind: 'qr', device: 'iphone', count: -4 }, { kind: 'qr', device: 'iphone', count: Number.NaN }, { kind: 'link', device: 'other', count: 2.9 }]);
  assert.deepEqual(totals, { visitQrCode: 0, visitShortUrl: 2, qrscanAndroid: 0, qrscanIphone: 0 });
});

test('sameTotals compares all four and treats nothing pushed yet as different', () => {
  const a = { visitQrCode: 1, visitShortUrl: 2, qrscanAndroid: 3, qrscanIphone: 4 };
  assert.equal(sameTotals(a, { ...a }), true);
  assert.equal(sameTotals(a, { ...a, qrscanIphone: 5 }), false);
  assert.equal(sameTotals(undefined, a), false);
});
