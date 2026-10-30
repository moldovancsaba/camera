import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMessmassStylePalette } from './messmass-style-palette';

test('parses the raw Messmass guest palette without changing its source values', () => {
  const result = parseMessmassStylePalette({
    name: 'MTK Budapest',
    resolvedFrom: 'partner',
    heroBackground: '#00b5e4ff',
    headingColor: '#004c87ff',
    page: {
      pageBackground: '#00b5e4ff',
      textColor: '#004c87ff',
      cardBackground: '#f3f4f6',
      cardBorder: '#d9dee7',
      buttonBackground: '#ffffff',
      buttonText: '#00b5e4ff',
      accentColor: '#00b5e4ff',
      linkColor: '#004c87ff',
      cardRadius: '0.75rem',
    },
  });

  assert.equal(result?.name, 'MTK Budapest');
  assert.equal(result?.heroBackground, '#00b5e4ff');
  assert.equal(result?.page?.buttonBackground, '#ffffff');
  assert.equal(result?.page?.buttonText, '#00b5e4ff');
});

test('rejects malformed required colours and ignores an incomplete optional page palette', () => {
  assert.equal(parseMessmassStylePalette({ name: 'Broken', resolvedFrom: 'partner', heroBackground: 'red', headingColor: '#000' }), null);
  const result = parseMessmassStylePalette({ name: 'Older style', resolvedFrom: 'partner', heroBackground: '#00b5e4', headingColor: '#004c87', page: { pageBackground: '#fff' } });
  assert.equal(result?.page, undefined);
});
