import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserLanguage } from './browser';
import { en } from './messages.en';
import { hu } from './messages.hu';

test('the browser decides: the first language it asks for, Hungarian only when that is Hungarian, English otherwise and when nothing is known', () => {
  assert.equal(browserLanguage(['hu-HU', 'en']), 'hu');
  assert.equal(browserLanguage(['HU']), 'hu');
  assert.equal(browserLanguage(['en-GB', 'hu']), 'en');
  assert.equal(browserLanguage(['de']), 'en');
  assert.equal(browserLanguage([]), 'en');
  assert.equal(browserLanguage(null), 'en');
  assert.equal(browserLanguage(undefined), 'en');
});

test('the error page texts exist in both languages and the Hungarian ones are real translations that keep the {id} marker', () => {
  const keys = ['errorPage.title', 'errorPage.fallback', 'errorPage.tryAgain', 'errorPage.goHome', 'errorPage.errorId'] as const;
  for (const key of keys) {
    assert.ok(en[key] && hu[key], key);
    assert.notEqual(hu[key], en[key], `${key} is translated`);
  }
  assert.ok(en['errorPage.errorId'].includes('{id}') && hu['errorPage.errorId'].includes('{id}'));
});
