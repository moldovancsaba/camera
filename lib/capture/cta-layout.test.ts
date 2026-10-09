import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ctaLayout } from './cta-layout';

const base = { url: 'https://club.example.test/join', hasButton: true };

test('by default everything is shown and the picture is not a link', () => {
  assert.deepEqual(ctaLayout(base), { showTexts: true, showVisitButton: true, showContinueButton: true, pictureLink: false, pictureTap: 'visit' });
});

test('the texts can be hidden on their own', () => {
  const layout = ctaLayout({ ...base, hideTexts: true });
  assert.equal(layout.showTexts, false);
  assert.equal(layout.showVisitButton && layout.showContinueButton, true);
});

test('the buttons go when the picture is the link: a tap opens the address in a new tab and goes on', () => {
  const layout = ctaLayout({ ...base, hideButtons: true, pictureLink: true });
  assert.deepEqual([layout.showVisitButton, layout.showContinueButton, layout.pictureLink, layout.pictureTap], [false, false, true, 'visit-and-continue']);
});

test('on the last page the buttons go and a tap goes to the address in the same tab', () => {
  const layout = ctaLayout({ ...base, hasButton: false, hideButtons: true, pictureLink: true });
  assert.deepEqual([layout.showVisitButton, layout.showContinueButton, layout.pictureLink, layout.pictureTap], [false, false, true, 'visit']);
});

test('the buttons stay when nothing else leads on: not the last page and the picture is not a link', () => {
  const layout = ctaLayout({ ...base, hideButtons: true });
  assert.deepEqual([layout.showVisitButton, layout.showContinueButton], [true, true]);
});

test('without an address the picture is no link and there is no visit button', () => {
  const layout = ctaLayout({ ...base, url: '  ', pictureLink: true, hideButtons: true });
  assert.deepEqual([layout.pictureLink, layout.showVisitButton, layout.showContinueButton], [false, false, true]);
});
