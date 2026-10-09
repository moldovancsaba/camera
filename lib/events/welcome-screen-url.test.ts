import assert from 'node:assert/strict';
import { test } from 'node:test';
import { welcomeScreenImage, welcomeScreenOf } from './welcome-screen-url';

test('the drawn picture of the public event is taken over, and only a plain https address', () => {
  assert.deepEqual(welcomeScreenOf({ welcomeScreen: { url: 'https://store.example.test/screens/e/welcome-1.png' } }), { url: 'https://store.example.test/screens/e/welcome-1.png' });
  for (const none of [undefined, null, {}, { welcomeScreen: null }, { welcomeScreen: {} }, { welcomeScreen: { url: 42 } }, { welcomeScreen: { url: 'http://insecure.example.test/a.png' } }, { welcomeScreen: { url: 'javascript:alert(1)' } }, { welcomeScreen: { url: '' } }]) {
    assert.equal(welcomeScreenOf(none as never), undefined, JSON.stringify(none));
  }
});

test('a page\'s own picture wins; without one the drawn picture is the giant screen; without either there is none', () => {
  const drawn = { url: 'https://store.example.test/welcome.png' };
  assert.equal(welcomeScreenImage('https://store.example.test/own.jpg', drawn), 'https://store.example.test/own.jpg');
  assert.equal(welcomeScreenImage(undefined, drawn), drawn.url);
  assert.equal(welcomeScreenImage('', drawn), drawn.url);
  assert.equal(welcomeScreenImage('   ', drawn), drawn.url);
  assert.equal(welcomeScreenImage(null, undefined), undefined);
});
