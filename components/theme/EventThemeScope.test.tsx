import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import EventThemeScope from './EventThemeScope';
import { resolveEventTheme } from '@/lib/theme/event-theme';

// A themed page paints the document and the GDS wrapper behind it in the page colour, or a white band shows under the page on a phone
// (docs/WELCOME_STEP.md, "The colour behind the page on a phone"; CLAUDE.md section 7). Rendering the rule is what this test keeps.
test('a themed page renders the rule that gives the document and the GDS wrapper the page colour', () => {
  const theme = resolveEventTheme({});
  const markup = renderToStaticMarkup(<EventThemeScope theme={theme}>content</EventThemeScope>);
  assert.ok(markup.includes(`html:root[data-mantine-color-scheme] { --mantine-color-body: ${theme.background}; background: ${theme.background}; }`));
});
